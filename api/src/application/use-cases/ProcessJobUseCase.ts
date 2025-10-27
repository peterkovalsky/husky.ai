import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IStorageService } from '../../domain/services/IStorageService';
import { JobMessage } from '../../domain/services/IQueueService';
import { BuildMetrics } from '../../domain/entities/Build';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { FileTreeMerger } from '../../shared/utils/FileTreeMerger';
import { CostCalculator } from '../../shared/utils/CostCalculator';
import { PrepareProjectEnvironmentUseCase } from './PrepareProjectEnvironmentUseCase';
import fs from 'fs';
import path from 'path';

export class ProcessJobUseCase {
  private readonly templateFilePath: string;
  private readonly buildLogger: BuildLogger;

  constructor(
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private aiService: IAIService,
    private buildService: IBuildService,
    private storageService: IStorageService,
    private prepareProjectEnvironmentUseCase: PrepareProjectEnvironmentUseCase,
    private mediaRepository: IMediaRepository
  ) {
    this.templateFilePath = path.join(__dirname, "../../template-react18-ts.json");
    this.buildLogger = new BuildLogger();
  }

  private async loadFileTreeForProject(projectId: string): Promise<Record<string, string>> {
    try {
      // First, check if we have a successful file tree in the database for this project
      const successfulBuild = await this.buildRepository.findLatestSuccessfulByProjectId(projectId);
      if (successfulBuild && successfulBuild.fileTree && typeof successfulBuild.fileTree === "object") {
        console.log("Using file tree from latest successful build (version", successfulBuild.version, ") for project:", projectId);
        return successfulBuild.fileTree;
      }

      // Fall back to initial file tree from JSON file for new projects
      console.log("No successful builds found, using initial file tree from template-react18-ts.json");
      const fileContent = fs.readFileSync(this.templateFilePath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      return typeof parsedContent === "object" && parsedContent !== null ? parsedContent : {};
    } catch (error) {
      console.error("Error loading file tree:", error);
      return {};
    }
  }

  private scanFileTreeForImageReferences(fileTree: Record<string, string>, publicUrls: string[]): Set<string> {
    const referenced = new Set<string>();
    const fileTreeString = JSON.stringify(fileTree);

    for (const url of publicUrls) {
      if (fileTreeString.includes(url)) {
        // Extract the s3 key from the public URL
        // URL format: https://<bucket>.s3.<region>.amazonaws.com/<key>
        // We need to extract the key part after the domain
        const urlParts = url.split('.amazonaws.com/');
        if (urlParts.length > 1) {
          const key = urlParts[1];
          referenced.add(key);
          console.log(`[Image Reference] Found reference to: ${url}`);
        }
      }
    }

    console.log(`[Image Scan] Found ${referenced.size} referenced images out of ${publicUrls.length} total`);
    return referenced;
  }


  async execute(jobMessage: JobMessage): Promise<void> {
    const { promptId, jobId, prompt, projectId, userId, mediaIds } = jobMessage;
    const actualPromptId = promptId || jobId; // Support both old and new message format

    if (!actualPromptId) {
      throw new Error('No prompt ID found in job message');
    }

    if (!projectId) {
      throw new Error('Project ID is required for job processing');
    }

    // Now TypeScript knows these are defined
    const safePromptId: string = actualPromptId;
    const safeProjectId: string = projectId;

    // Initialize metrics tracking
    const jobStartTime = Date.now();
    const metrics: BuildMetrics = {};
    let buildId: string | null = null;

    try {
      console.log(`Processing prompt ${safePromptId}...`);
      console.log(`Job message mediaIds:`, mediaIds);

      // Check if prompt already has a build (prevent duplicate processing)
      const existingPrompt = await this.promptRepository.findById(safePromptId);
      if (!existingPrompt) {
        throw new Error(`Prompt ${safePromptId} not found`);
      }

      if (existingPrompt.buildId) {
        console.log(`Prompt ${safePromptId} already has build ${existingPrompt.buildId}, skipping duplicate processing`);
        return;
      }

      // Create build with PROCESSING status and version 0
      console.log(`Creating build with mediaIds:`, mediaIds);
      const createdBuild = await this.buildRepository.create({
        fileTree: {},
        projectId: safeProjectId,
        status: 'PROCESSING',
        mediaIds: mediaIds || []
      });
      buildId = createdBuild.id;
      console.log(`Build created with ID: ${buildId}, mediaIds in build:`, createdBuild.mediaIds);

      // Link prompt to build
      await this.promptRepository.updateBuildId(safePromptId, buildId);

      // START PARALLEL OPERATIONS
      // 1. Start environment preparation (runs in background)
      console.log(`[PARALLEL] Starting environment preparation for project ${safeProjectId}...`);
      const envPrepPromise = this.prepareProjectEnvironmentUseCase.execute(safeProjectId);

      // 2. Load file tree and prepare AI context
      const fileTree = await this.loadFileTreeForProject(safeProjectId);
      await this.aiService.setProjectContext(safeProjectId, fileTree, buildId);

      // Get conversation context
      const previousPrompts = await this.promptRepository.findByProjectId(safeProjectId);
      const conversation = previousPrompts
        .filter((p) => p.id !== safePromptId) // Exclude current prompt
        .map((p) => `User: ${p.prompt}`)
        .join("\n\n");

      // 3. Upload media to public S3 bucket and update database
      let publicMediaUrls: string[] = [];
      const publicUploadStartTime = Date.now();

      if (mediaIds && mediaIds.length > 0) {
        console.log(`Uploading ${mediaIds.length} media files to public S3 for prompt ${safePromptId}...`);
        const medias = await this.mediaRepository.findByIds(mediaIds);

        // Copy each media to public bucket and update database
        const uploadPromises = medias.map(async (media) => {
          const { publicKey, publicUrl } = await this.storageService.copyToPublicBucket(
            media.s3Key,
            media.s3Bucket,
            safeProjectId
          );

          // Update media record with public S3 info
          await this.mediaRepository.updatePublicS3Info(media.id, publicKey, process.env.S3_BUCKET_PUBLIC_MEDIA!);

          return publicUrl;
        });

        publicMediaUrls = await Promise.all(uploadPromises);
        metrics.publicS3UploadTimeMs = Date.now() - publicUploadStartTime;
        console.log(`Uploaded ${publicMediaUrls.length} images to public S3 in ${metrics.publicS3UploadTimeMs}ms`);
      }

      // Use public URLs for AI (not presigned URLs)
      const mediaUrls = publicMediaUrls;

      // 4. Determine which AI model to use based on media presence
      // - Use Sonnet 4.5 when images/media are present (better at analyzing and using images)
      // - Use Haiku 4.5 when no images (faster, cheaper for text-only iterations)
      const hasSuccessfulBuilds = await this.buildRepository.findLatestSuccessfulByProjectId(safeProjectId);
      const hasImages = mediaIds && mediaIds.length > 0;
      const useHaiku = !hasImages; // Use Haiku only when no media is present

      // 5. AI generation (runs while environment prep happens in parallel)
      console.log(`[PARALLEL] Running AI stage for prompt ${safePromptId}...`);
      console.log(`[AI Model Selection] Using ${useHaiku ? 'Haiku' : 'Sonnet'} - Reason: ${hasImages ? 'has media (use Sonnet for better image analysis)' : 'no media (use Haiku for faster text-only iterations)'}`);
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(prompt, safePromptId, useHaiku, mediaUrls);
      metrics.aiGenerationTimeMs = Date.now() - aiStartTime;
      console.log(`[PARALLEL] AI generation completed in ${metrics.aiGenerationTimeMs}ms (Model: ${aiResponse.model})`);

      // Parse the AI response to get the updated file tree
      const responseData = JSON.parse(aiResponse.content);
      const aiResponseFileTree = responseData.fileTree;

      if (!aiResponseFileTree) {
        throw new Error("No file tree found in AI response");
      }

      // Merge AI response with current file tree
      console.log(`Merging AI response with current file tree for prompt ${safePromptId}...`);
      const mergeResult = FileTreeMerger.merge(fileTree, aiResponseFileTree);

      // Log merge statistics
      FileTreeMerger.logMergeStats(mergeResult);

      // Update build with the merged file tree
      console.log(`Updating build with merged file tree for prompt ${safePromptId}...`);
      await this.buildRepository.updateFileTree(buildId!, mergeResult.mergedFileTree);

      // Scan file tree for image references and cleanup unreferenced images
      if (mediaIds && mediaIds.length > 0 && publicMediaUrls.length > 0) {
        console.log(`[Image Cleanup] Scanning file tree for image references...`);
        const referencedImages = this.scanFileTreeForImageReferences(mergeResult.mergedFileTree, publicMediaUrls);

        // Delete unreferenced images from public S3 (not from private bucket)
        const medias = await this.mediaRepository.findByIds(mediaIds);

        for (const media of medias) {
          if (media.s3PublicKey && !referencedImages.has(media.s3PublicKey)) {
            console.log(`[Image Cleanup] Deleting unreferenced image from public S3: ${media.s3PublicKey}`);
            try {
              await this.storageService.deleteFromPublicBucket(media.s3PublicKey);

              // Clear public S3 fields from database
              await this.mediaRepository.updatePublicS3Info(media.id, '', '');
            } catch (error) {
              console.warn(`[Image Cleanup] Failed to delete unreferenced image ${media.s3PublicKey}:`, error);
              // Continue with other images even if one fails
            }
          } else if (media.s3PublicKey) {
            console.log(`[Image Cleanup] Keeping referenced image: ${media.s3PublicKey}`);
          }
        }
      }

      // Log merged result and merge details in dev mode (AI response already logged in AnthropicAIService)
      this.buildLogger.logMergedResult(safeProjectId, buildId, mergeResult.mergedFileTree);
      this.buildLogger.logMergeDetails(safeProjectId, buildId, mergeResult);
      this.buildLogger.logBuildInfo(safeProjectId, buildId, {
        promptId: safePromptId,
        prompt: prompt,
        contextPrompt: prompt,
        hasConversationHistory: !!conversation,
        fileTreeSize: Object.keys(mergeResult.mergedFileTree).length,
        aiGenerationTimeMs: metrics.aiGenerationTimeMs,
        modelUsed: aiResponse.model
      });

      // WAIT FOR ENVIRONMENT PREPARATION TO COMPLETE
      // This ensures node_modules and package-lock.json are ready before we write files
      console.log(`[PARALLEL] Waiting for environment preparation to complete...`);
      const envPrepResult = await envPrepPromise;
      metrics.environmentPrepTimeMs = envPrepResult.totalPrepTime;
      metrics.nodeModulesCopyTimeMs = envPrepResult.nodeModulesCopyTime;
      console.log(`[PARALLEL] Environment preparation completed in ${envPrepResult.totalPrepTime}ms`);

      // Clean working directory if this is an iterative build (reuse hasSuccessfulBuilds from earlier)
      if (hasSuccessfulBuilds) {
        // Clean working directory before writing new files (preserve node_modules and package-lock.json)
        console.log(`Cleaning working directory for iterative build on prompt ${safePromptId}...`);
        await this.buildService.cleanWorkingDirectory(safeProjectId);
      }

      // Save files to disk using BuildService (this creates the web directory)
      // Note: version is still 0 at this point, will be assigned when build reaches READY status
      console.log(`Saving merged files to disk for prompt ${safePromptId}...`);
      const appDirectory = await this.buildService.saveFileTreeToDisk(mergeResult.mergedFileTree, safeProjectId, 0);

      // Update build status to BUILDING
      await this.buildRepository.updateStatus(buildId!, "BUILDING");

      // Assign version number before building (need it for S3 paths)
      const buildVersion = await this.buildRepository.getNextVersionForProject(safeProjectId);
      await this.buildRepository.updateVersion(buildId!, buildVersion);
      console.log(`Assigned version ${buildVersion} to build ${buildId}`);

      // Build stage - Preview build with project-specific base path
      console.log(`Running preview build stage for prompt ${safePromptId}...`);
      const buildResult = await this.buildService.buildApp(appDirectory, safeProjectId);

      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error || "Unknown build error"}`);
      }

      metrics.dependencyInstallTimeMs = buildResult.dependencyInstallTime || 0;
      metrics.buildTimeMs = buildResult.buildTime || 0;

      // Upload preview build to preview bucket
      console.log(`Uploading preview build to preview bucket for prompt ${safePromptId}...`);
      const uploadStartTime = Date.now();
      const uploadResult = await this.storageService.uploadReactApp(appDirectory, safePromptId, safeProjectId);
      metrics.s3UploadTimeMs = Date.now() - uploadStartTime;

      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to S3: ${uploadResult.error}`);
      }

      // Save preview URL to project (only set if it's not already set)
      if (uploadResult.previewUrl) {
        const project = await this.projectRepository.findById(safeProjectId);
        if (project && !project.previewUrl) {
          await this.projectRepository.updatePreviewUrl(safeProjectId, uploadResult.previewUrl);
        }
      }

      // Upload source code to projects bucket
      try {
        console.log(`Uploading source code to projects bucket for project ${safeProjectId} version ${buildVersion}...`);
        const sourceUploadStartTime = Date.now();
        const sourceUploadResult = await this.storageService.uploadSourceCode(appDirectory, safeProjectId, buildVersion);

        if (sourceUploadResult.success) {
          metrics.versionSourceUploadTimeMs = Date.now() - sourceUploadStartTime;
          console.log(`Source code uploaded successfully in ${metrics.versionSourceUploadTimeMs}ms. Files: ${sourceUploadResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`Failed to upload source code to projects bucket: ${sourceUploadResult.error}`);
        }
      } catch (error) {
        console.warn(`Error uploading source code to projects bucket:`, error);
      }

      // Upload preview build to projects bucket (preview-build folder)
      try {
        console.log(`Uploading preview build to projects bucket for project ${safeProjectId} version ${buildVersion}...`);
        const previewUploadStartTime = Date.now();
        const previewUploadResult = await this.storageService.uploadPreviewVersion(appDirectory, safeProjectId, buildVersion);

        if (previewUploadResult.success) {
          metrics.versionPreviewUploadTimeMs = Date.now() - previewUploadStartTime;
          console.log(`Preview build uploaded successfully in ${metrics.versionPreviewUploadTimeMs}ms. Files: ${previewUploadResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`Failed to upload preview build to projects bucket: ${previewUploadResult.error}`);
        }
      } catch (error) {
        console.warn(`Error uploading preview build to projects bucket:`, error);
      }

      // Clean dist folder before production build
      console.log(`Cleaning dist folder before production build...`);
      const distPath = path.join(appDirectory, "dist");
      if (fs.existsSync(distPath)) {
        fs.rmSync(distPath, { recursive: true, force: true });
        console.log(`Dist folder cleaned`);
      }

      // Build production version with root path
      console.log(`Running production build with root path for prompt ${safePromptId}...`);
      const productionBuildStartTime = Date.now();
      const productionBuildResult = await this.buildService.buildAppWithBasePath(appDirectory, "/");
      metrics.productionBuildTimeMs = Date.now() - productionBuildStartTime;

      if (!productionBuildResult.success) {
        console.warn(`Production build failed: ${productionBuildResult.error || "Unknown build error"}`);
      } else {
        console.log(`Production build completed in ${metrics.productionBuildTimeMs}ms`);

        // Upload production build to projects bucket (production-build folder)
        try {
          console.log(`Uploading production build to projects bucket for project ${safeProjectId} version ${buildVersion}...`);
          const productionUploadStartTime = Date.now();
          const productionUploadResult = await this.storageService.uploadProductionVersion(appDirectory, safeProjectId, buildVersion);

          if (productionUploadResult.success) {
            metrics.versionProductionUploadTimeMs = Date.now() - productionUploadStartTime;
            console.log(`Production build uploaded successfully in ${metrics.versionProductionUploadTimeMs}ms. Files: ${productionUploadResult.uploadedFiles?.length || 0}`);
          } else {
            console.warn(`Failed to upload production build to projects bucket: ${productionUploadResult.error}`);
          }
        } catch (error) {
          console.warn(`Error uploading production build to projects bucket:`, error);
        }
      }

      // Calculate total time
      metrics.totalTimeMs = Date.now() - jobStartTime;

      // Update build status to READY
      await this.buildRepository.updateStatus(buildId!, "READY");

      // Update token usage data
      if (aiResponse.usage && aiResponse.usage.inputTokens && aiResponse.usage.outputTokens) {
        await this.buildRepository.updateTokens(buildId!, aiResponse.usage.inputTokens, aiResponse.usage.outputTokens);
      }

      // Update build metrics with all final timings
      if (buildId) {
        try {
          await this.buildRepository.updateMetrics(buildId, metrics);
        } catch (metricsError) {
          console.warn("Failed to update build metrics:", metricsError);
        }
      }

      // Update project's current_version to this successful build
      try {
        await this.projectRepository.updateCurrentVersion(safeProjectId, buildVersion);
        console.log(`Updated project ${safeProjectId} current_version to ${buildVersion}`);
      } catch (versionError) {
        console.warn("Failed to update current_version:", versionError);
      }

      console.log(`Prompt ${safePromptId} completed successfully. Preview URL: ${uploadResult.previewUrl}`);

      // Log detailed metrics breakdown
      console.log(`\n=== Build Metrics Breakdown ===`);
      console.log(`Model Used:             ${aiResponse.model}`);
      console.log(`PARALLEL PHASE:`);
      console.log(`  AI Generation:        ${metrics.aiGenerationTimeMs || 0}ms`);
      console.log(`  Environment Prep:     ${metrics.environmentPrepTimeMs || 0}ms (ran in parallel with AI)`);
      console.log(`    - node_modules:     ${metrics.nodeModulesCopyTimeMs || 0}ms ${metrics.nodeModulesCopyTimeMs ? '(copied from template)' : '(already exists)'}`);
      console.log(`SETUP PHASE:`);
      console.log(`  Public S3 Upload:     ${metrics.publicS3UploadTimeMs || 0}ms ${metrics.publicS3UploadTimeMs ? `(${mediaIds?.length || 0} images)` : ''}`);
      console.log(`BUILD & UPLOAD PHASE:`);
      console.log(`  npm install:          ${metrics.dependencyInstallTimeMs || 0}ms ${metrics.dependencyInstallTimeMs === 0 ? '(skipped - package.json unchanged)' : ''}`);
      console.log(`  Preview Build:        ${metrics.buildTimeMs || 0}ms`);
      console.log(`  Preview Upload (S3):  ${metrics.s3UploadTimeMs || 0}ms`);
      console.log(`  Source Upload:        ${metrics.versionSourceUploadTimeMs || 0}ms`);
      console.log(`  Preview Upload (Ver): ${metrics.versionPreviewUploadTimeMs || 0}ms`);
      console.log(`  Production Build:     ${metrics.productionBuildTimeMs || 0}ms`);
      console.log(`  Production Upload:    ${metrics.versionProductionUploadTimeMs || 0}ms`);
      console.log(`---`);
      console.log(`Total Wall-Clock:       ${metrics.totalTimeMs || 0}ms`);
      console.log(`Parallelization Savings: ~${Math.max(0, Math.min(metrics.aiGenerationTimeMs || 0, metrics.environmentPrepTimeMs || 0))}ms`);
      console.log(`================================\n`);

    } catch (error) {
      console.error(`Error processing prompt ${safePromptId}:`, error);

      // Calculate total time even for failed jobs
      metrics.totalTimeMs = Date.now() - jobStartTime;

      // Update build metrics even on failure
      if (buildId) {
        try {
          await this.buildRepository.updateMetrics(buildId, metrics);
        } catch (metricsError) {
          console.error("Failed to update metrics on error:", metricsError);
        }
      }

      // Update build status with error
      if (buildId) {
        await this.buildRepository.updateStatus(buildId, "FAILED");
      }

      throw error; // Re-throw to be handled by job processor
    }
  }
}