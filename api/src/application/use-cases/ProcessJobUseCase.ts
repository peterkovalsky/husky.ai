import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IStorageService } from '../../domain/services/IStorageService';
import { JobMessage } from '../../domain/services/IQueueService';
import { BuildMetrics } from '../../domain/entities/Build';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { FileTreeMerger } from '../../shared/utils/FileTreeMerger';
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
    private storageService: IStorageService
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


  async execute(jobMessage: JobMessage): Promise<void> {
    const { promptId, jobId, prompt, projectId, userId } = jobMessage;
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

      // Check if prompt already has a build (prevent duplicate processing)
      const existingPrompt = await this.promptRepository.findById(safePromptId);
      if (!existingPrompt) {
        throw new Error(`Prompt ${safePromptId} not found`);
      }
      
      if (existingPrompt.buildId) {
        console.log(`Prompt ${safePromptId} already has build ${existingPrompt.buildId}, skipping duplicate processing`);
        return;
      }

      // Create build with PROCESSING status
      const createdBuild = await this.buildRepository.create({
        fileTree: {},
        projectId: safeProjectId,
        status: 'PROCESSING'
      });
      buildId = createdBuild.id;
      const buildVersion = createdBuild.version;

      // Link prompt to build
      await this.promptRepository.updateBuildId(safePromptId, buildId);

      // Load file tree for the project and set AI service context
      const fileTree = await this.loadFileTreeForProject(safeProjectId);
      await this.aiService.setProjectContext(safeProjectId, fileTree, buildId);

      // Get conversation context
      const previousPrompts = await this.promptRepository.findByProjectId(safeProjectId);
      const conversation = previousPrompts
        .filter((p) => p.id !== safePromptId) // Exclude current prompt
        .map((p) => `User: ${p.prompt}`)
        .join("\n\n");

      // AI stage: Generate response (raw response is saved in AI service)
      console.log(`Running AI stage for prompt ${safePromptId} with web search enabled...`);
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(prompt, safePromptId);
      metrics.aiGenerationTimeMs = Date.now() - aiStartTime;

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

      // Log merged result and merge details in dev mode (AI response already logged in AnthropicAIService)
      this.buildLogger.logMergedResult(safeProjectId, buildId, mergeResult.mergedFileTree);
      this.buildLogger.logMergeDetails(safeProjectId, buildId, mergeResult);
      this.buildLogger.logBuildInfo(safeProjectId, buildId, {
        promptId: safePromptId,
        prompt: prompt,
        contextPrompt: prompt,
        hasConversationHistory: !!conversation,
        fileTreeSize: Object.keys(mergeResult.mergedFileTree).length,
        aiGenerationTimeMs: metrics.aiGenerationTimeMs
      });

      // Save files to disk using BuildService (this creates the versioned directory)
      console.log(`Saving merged files to disk for prompt ${safePromptId}...`);
      const appDirectory = await this.buildService.saveFileTreeToDisk(mergeResult.mergedFileTree, safeProjectId, buildVersion);

      // Start node_modules copying in parallel (don't await)
      console.log(`Starting parallel node_modules copy for prompt ${safePromptId}...`);
      const nodeModulesCopyPromise = this.buildService.copyNodeModulesAsync(appDirectory, safeProjectId);

      // Update build status to BUILDING
      await this.buildRepository.updateStatus(buildId!, "BUILDING");

      // Wait for node_modules copying to complete before building
      console.log(`Waiting for node_modules copy to complete for prompt ${safePromptId}...`);
      await nodeModulesCopyPromise;

      // Build stage
      console.log(`Running build stage for prompt ${safePromptId}...`);
      const buildResult = await this.buildService.buildApp(appDirectory, safeProjectId);
      
      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error || "Unknown build error"}`);
      }

      metrics.dependencyInstallTimeMs = buildResult.dependencyInstallTime || 0;
      metrics.buildTimeMs = buildResult.buildTime || 0;

      // Upload to S3
      console.log(`Uploading to S3 for prompt ${safePromptId}...`);
      const uploadStartTime = Date.now();
      const uploadResult = await this.storageService.uploadReactApp(appDirectory, safePromptId, safeProjectId);
      metrics.s3UploadTimeMs = Date.now() - uploadStartTime;

      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to S3: ${uploadResult.error}`);
      }

      // Calculate total time
      metrics.totalTimeMs = Date.now() - jobStartTime;

      // Update build metrics in database
      if (buildId) {
        await this.buildRepository.updateMetrics(buildId, metrics);
      }

      // Save preview URL to project (only set if it's not already set)
      if (uploadResult.previewUrl) {
        const project = await this.projectRepository.findById(safeProjectId);
        if (project && !project.previewUrl) {
          await this.projectRepository.updatePreviewUrl(safeProjectId, uploadResult.previewUrl);
        }
      }

      // Update build status to READY
      await this.buildRepository.updateStatus(buildId!, "READY");

      // Update token usage data
      if (aiResponse.usage && aiResponse.usage.inputTokens && aiResponse.usage.outputTokens) {
        await this.buildRepository.updateTokens(buildId!, aiResponse.usage.inputTokens, aiResponse.usage.outputTokens);
      }

      // Upload version history to S3 versions bucket (after build is READY)
      try {
        console.log(`Uploading source code to versions bucket for project ${safeProjectId} version ${buildVersion}...`);
        console.log(`Source upload directory: ${appDirectory}`);
        const sourceUploadStartTime = Date.now();
        const sourceUploadResult = await this.storageService.uploadSourceCode(appDirectory, safeProjectId, buildVersion);
        
        if (sourceUploadResult.success) {
          metrics.versionSourceUploadTimeMs = Date.now() - sourceUploadStartTime;
          console.log(`Source code uploaded successfully in ${metrics.versionSourceUploadTimeMs}ms. Files: ${sourceUploadResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`Failed to upload source code to versions bucket: ${sourceUploadResult.error}`);
        }
      } catch (error) {
        console.warn(`Error uploading source code to versions bucket:`, error);
      }

      try {
        console.log(`Uploading build to versions bucket for project ${safeProjectId} version ${buildVersion}...`);
        console.log(`Build upload directory: ${appDirectory}`);
        const distPath = path.join(appDirectory, "dist");
        console.log(`Dist path exists: ${fs.existsSync(distPath)}`);
        if (fs.existsSync(distPath)) {
          const distFiles = fs.readdirSync(distPath);
          console.log(`Dist folder contents: ${distFiles.join(', ')}`);
        }
        
        const buildUploadStartTime = Date.now();
        const buildUploadResult = await this.storageService.uploadProductionVersion(appDirectory, safeProjectId, buildVersion);
        
        if (buildUploadResult.success) {
          metrics.versionProductionUploadTimeMs = Date.now() - buildUploadStartTime;
          console.log(`Build uploaded successfully in ${metrics.versionProductionUploadTimeMs}ms. Files: ${buildUploadResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`Failed to upload build to versions bucket: ${buildUploadResult.error}`);
        }
      } catch (error) {
        console.warn(`Error uploading build to versions bucket:`, error);
      }

      // Update build metrics with version upload timings
      if (buildId && (metrics.versionSourceUploadTimeMs || metrics.versionProductionUploadTimeMs)) {
        try {
          await this.buildRepository.updateMetrics(buildId, metrics);
        } catch (metricsError) {
          console.warn("Failed to update version upload metrics:", metricsError);
        }
      }

      console.log(`Prompt ${safePromptId} completed successfully. Preview URL: ${uploadResult.previewUrl}`);
      console.log(`Build metrics:`, metrics);

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