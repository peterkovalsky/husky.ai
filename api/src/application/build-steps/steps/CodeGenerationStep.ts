import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IPromptRepository } from '../../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IMediaRepository } from '../../../domain/repositories/IMediaRepository';
import { IAIService } from '../../../domain/services/IAIService';
import { IStorageService } from '../../../domain/services/IStorageService';
import { PrepareProjectEnvironmentUseCase } from '../../use-cases/PrepareProjectEnvironmentUseCase';
import { BuildLogger } from '../../../shared/logger/BuildLogger';
import { FileTreeMerger } from '../../../shared/utils/FileTreeMerger';
import fs from 'fs';
import path from 'path';

/**
 * CodeGenerationStep: Handles AI code generation and file tree merging
 *
 * Responsibilities:
 * - Load existing file tree (from latest successful build or template)
 * - Start environment preparation in parallel (node_modules copy)
 * - Upload media files to public S3
 * - Set AI context and get conversation history
 * - Select appropriate AI model (Sonnet vs Haiku)
 * - Generate code using AI
 * - Parse and merge AI response with current file tree
 * - Scan for image references and cleanup unreferenced images
 * - Wait for environment preparation to complete
 * - Update build record with merged file tree
 */
export class CodeGenerationStep implements IBuildStep {
  readonly stepName = 'Code Generation';
  readonly stepStatus = BuildStepStatus.GENERATING_CODE;

  private readonly templateFilePath: string;
  private readonly buildLogger: BuildLogger;

  constructor(
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository,
    private mediaRepository: IMediaRepository,
    private aiService: IAIService,
    private storageService: IStorageService,
    private prepareProjectEnvironmentUseCase: PrepareProjectEnvironmentUseCase
  ) {
    this.templateFilePath = path.join(__dirname, "../../../template-react18-ts.json");
    this.buildLogger = new BuildLogger();
  }

  async execute(context: BuildStepContext): Promise<StepResult> {
    const stepStartTime = Date.now();
    const buildId = context.requireBuildId();

    try {
      console.log(`[${this.stepName}] Starting code generation for project ${context.projectId}...`);

      // Update status
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // START PARALLEL OPERATIONS
      // 1. Start environment preparation (runs in background)
      console.log(`[${this.stepName}] [PARALLEL] Starting environment preparation...`);
      const envPrepPromise = this.prepareProjectEnvironmentUseCase.execute(context.projectId);

      // 2. Load file tree and prepare AI context
      const fileTree = await this.loadFileTreeForProject(context.projectId);
      await this.aiService.setProjectContext(context.projectId, fileTree, buildId);

      // Get conversation context from previous prompts
      const previousPrompts = await this.promptRepository.findByProjectId(context.projectId);
      const conversation = previousPrompts
        .filter((p) => p.id !== context.promptId) // Exclude current prompt
        .map((p) => `User: ${p.prompt}`)
        .join("\n\n");

      // 3. Upload media to public S3 bucket
      let publicMediaUrls: string[] = [];
      const publicUploadStartTime = Date.now();
      let publicS3UploadTimeMs = 0;

      if (context.mediaIds && context.mediaIds.length > 0) {
        console.log(`[${this.stepName}] Uploading ${context.mediaIds.length} media files to public S3...`);
        const medias = await this.mediaRepository.findByIds(context.mediaIds);

        // Upload each media file in parallel
        const uploadPromises = medias.map(async (media) => {
          const { publicKey, publicUrl } = await this.storageService.copyToPublicBucket(
            media.s3Key,
            media.s3Bucket,
            context.projectId
          );

          // Update media record with public S3 info
          await this.mediaRepository.updatePublicS3Info(media.id, publicKey, process.env.S3_BUCKET_PUBLIC_MEDIA!);

          return publicUrl;
        });

        publicMediaUrls = await Promise.all(uploadPromises);
        publicS3UploadTimeMs = Date.now() - publicUploadStartTime;
        console.log(`[${this.stepName}] Uploaded ${publicMediaUrls.length} images to public S3 in ${publicS3UploadTimeMs}ms`);
      }

      // 4. Determine which AI model to use
      const hasSuccessfulBuilds = await this.buildRepository.findLatestSuccessfulByProjectId(context.projectId);
      const hasImages = context.mediaIds && context.mediaIds.length > 0;
      const isFirstBuild = !hasSuccessfulBuilds;
      const useHaiku = !isFirstBuild && !hasImages;

      const modelReason = isFirstBuild
        ? 'first build (always use Sonnet for better quality initial setup)'
        : hasImages
          ? 'has media (use Sonnet for better image analysis)'
          : 'no media (use Haiku for faster text-only iterations)';
      console.log(`[${this.stepName}] Using ${useHaiku ? 'Haiku' : 'Sonnet'} - Reason: ${modelReason}`);

      // 5. Generate AI response
      const prompt = context.getStepData<string>('userPrompt');
      if (!prompt) {
        // Fallback: get from prompt repository
        const promptRecord = await this.promptRepository.findById(context.promptId);
        if (!promptRecord) {
          throw new Error(`Prompt ${context.promptId} not found`);
        }
        context.setStepData('userPrompt', promptRecord.prompt);
      }

      console.log(`[${this.stepName}] [PARALLEL] Running AI generation...`);
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(
        prompt || '',
        context.promptId,
        useHaiku,
        publicMediaUrls
      );
      const aiGenerationTimeMs = Date.now() - aiStartTime;
      console.log(`[${this.stepName}] [PARALLEL] AI generation completed in ${aiGenerationTimeMs}ms (Model: ${aiResponse.model})`);

      // 6. Parse and merge file tree
      console.log(`[${this.stepName}] Parsing AI response and merging file tree...`);
      const responseData = JSON.parse(aiResponse.content);
      const aiResponseFileTree = responseData.fileTree;

      if (!aiResponseFileTree) {
        throw new Error("No file tree found in AI response");
      }

      const mergeResult = FileTreeMerger.merge(fileTree, aiResponseFileTree);
      FileTreeMerger.logMergeStats(mergeResult);

      // Store merged file tree in context for next steps
      context.fileTree = mergeResult.mergedFileTree;

      // Update build with merged file tree
      await this.buildRepository.updateFileTree(buildId, mergeResult.mergedFileTree);

      // 7. Scan for image references and cleanup unreferenced images
      if (context.mediaIds && context.mediaIds.length > 0 && publicMediaUrls.length > 0) {
        console.log(`[${this.stepName}] [Image Cleanup] Scanning file tree for image references...`);
        const referencedImages = this.scanFileTreeForImageReferences(mergeResult.mergedFileTree, publicMediaUrls);

        const medias = await this.mediaRepository.findByIds(context.mediaIds);

        for (const media of medias) {
          if (media.s3PublicKey && !referencedImages.has(media.s3PublicKey)) {
            console.log(`[${this.stepName}] [Image Cleanup] Deleting unreferenced image: ${media.s3PublicKey}`);
            try {
              await this.storageService.deleteFromPublicBucket(media.s3PublicKey);
              await this.mediaRepository.updatePublicS3Info(media.id, '', '');
            } catch (error) {
              console.warn(`[${this.stepName}] [Image Cleanup] Failed to delete unreferenced image:`, error);
            }
          } else if (media.s3PublicKey) {
            console.log(`[${this.stepName}] [Image Cleanup] Keeping referenced image: ${media.s3PublicKey}`);
          }
        }
      }

      // Log build info
      this.buildLogger.logMergedResult(context.projectId, buildId, mergeResult.mergedFileTree);
      this.buildLogger.logMergeDetails(context.projectId, buildId, mergeResult);
      this.buildLogger.logBuildInfo(context.projectId, buildId, {
        promptId: context.promptId,
        prompt: prompt || '',
        contextPrompt: prompt || '',
        hasConversationHistory: !!conversation,
        fileTreeSize: Object.keys(mergeResult.mergedFileTree).length,
        aiGenerationTimeMs,
        modelUsed: aiResponse.model
      });

      // 8. WAIT FOR ENVIRONMENT PREPARATION TO COMPLETE
      console.log(`[${this.stepName}] [PARALLEL] Waiting for environment preparation to complete...`);
      const envPrepResult = await envPrepPromise;
      const environmentPrepTimeMs = envPrepResult.totalPrepTime;
      const nodeModulesCopyTimeMs = envPrepResult.nodeModulesCopyTime;
      console.log(`[${this.stepName}] [PARALLEL] Environment preparation completed in ${environmentPrepTimeMs}ms`);

      const duration = Date.now() - stepStartTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);

      // Store whether this is an iterative build for the next step
      context.setStepData('isIterativeBuild', !!hasSuccessfulBuilds);

      return {
        success: true,
        metrics: {
          aiGenerationTimeMs,
          environmentPrepTimeMs,
          nodeModulesCopyTimeMs,
          publicS3UploadTimeMs
        }
      };
    } catch (error) {
      const duration = Date.now() - stepStartTime;
      console.error(`[${this.stepName}] Failed after ${duration}ms:`, error);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Load file tree from latest successful build or template
   */
  private async loadFileTreeForProject(projectId: string): Promise<Record<string, string>> {
    try {
      // Check if we have a successful file tree in the database
      const successfulBuild = await this.buildRepository.findLatestSuccessfulByProjectId(projectId);
      if (successfulBuild && successfulBuild.fileTree && typeof successfulBuild.fileTree === "object") {
        console.log(`[${this.stepName}] Using file tree from latest successful build (version ${successfulBuild.version})`);
        return successfulBuild.fileTree;
      }

      // Fall back to initial template for new projects
      console.log(`[${this.stepName}] No successful builds found, using initial template`);
      const fileContent = fs.readFileSync(this.templateFilePath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      return typeof parsedContent === "object" && parsedContent !== null ? parsedContent : {};
    } catch (error) {
      console.error(`[${this.stepName}] Error loading file tree:`, error);
      return {};
    }
  }

  /**
   * Scan file tree for image references
   */
  private scanFileTreeForImageReferences(fileTree: Record<string, string>, publicUrls: string[]): Set<string> {
    const referenced = new Set<string>();
    const fileTreeString = JSON.stringify(fileTree);

    for (const url of publicUrls) {
      if (fileTreeString.includes(url)) {
        // Extract S3 key from public URL
        // Format: https://<bucket>.s3.<region>.amazonaws.com/<key>
        const urlParts = url.split('.amazonaws.com/');
        if (urlParts.length > 1) {
          const key = urlParts[1];
          referenced.add(key);
          console.log(`[${this.stepName}] [Image Reference] Found reference to: ${url}`);
        }
      }
    }

    console.log(`[${this.stepName}] [Image Scan] Found ${referenced.size} referenced images out of ${publicUrls.length} total`);
    return referenced;
  }
}
