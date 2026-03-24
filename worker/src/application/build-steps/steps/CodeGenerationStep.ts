import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IMediaRepository } from '../../../domain/repositories/IMediaRepository';
import { IInspoRepository } from '../../../domain/repositories/IInspoRepository';
import { IAIService } from '../../../domain/services/IAIService';
import { IStorageService } from '../../../domain/services/IStorageService';
import { IPublicMediaStorageService } from '../../../domain/services/IPublicMediaStorageService';
import { PrepareProjectEnvironmentUseCase } from '../../use-cases/PrepareProjectEnvironmentUseCase';
import { BuildLogger } from '../../../shared/logger/BuildLogger';
import { FileTreeMerger } from '../../../shared/utils/FileTreeMerger';
import { loadAppConfig } from '../../../shared/config/AppConfig';
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
    private buildRepository: IBuildRepository,
    private mediaRepository: IMediaRepository,
    private inspoRepository: IInspoRepository,
    private aiService: IAIService,
    private storageService: IStorageService,
    private prepareProjectEnvironmentUseCase: PrepareProjectEnvironmentUseCase,
    private publicMediaStorageService: IPublicMediaStorageService
  ) {
    this.templateFilePath = path.join(__dirname, "../../../template-react18-ts.json");
    this.buildLogger = new BuildLogger();
  }

  async execute(context: BuildStepContext): Promise<StepResult> {
    const stepStartTime = Date.now();
    const buildId = context.buildId;

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

      // Get conversation context from previous builds (builds are now the source of truth)
      const previousBuilds = await this.buildRepository.findByProjectId(context.projectId);
      const conversation = previousBuilds
        .filter((b) => b.id !== context.buildId && (b.status === BuildStepStatus.COMPLETED || b.status === BuildStepStatus.NEEDS_RESPONSE))
        .map((b) => {
          let entry = `User: ${b.userPrompt}`;
          if (b.status === BuildStepStatus.NEEDS_RESPONSE && b.aiSummary) {
            // aiSummary field is reused for question context in NEEDS_RESPONSE builds
            entry += `\nAI: [Asked clarifying questions]`;
          }
          return entry;
        })
        .join("\n\n");

      // 3. Upload media to public R2 bucket
      let publicMediaUrls: string[] = [];
      const publicUploadStartTime = Date.now();
      let publicR2UploadTimeMs = 0;

      // Track text file content to append to prompt
      let textFileContents: { fileName: string; content: string }[] = [];

      if (context.mediaIds && context.mediaIds.length > 0) {
        console.log(`[${this.stepName}] Processing ${context.mediaIds.length} media files...`);
        const medias = await this.mediaRepository.findByIds(context.mediaIds);

        // Separate text files from other media
        const textMedias = medias.filter(m => m.mimeType === 'text/plain');
        const nonTextMedias = medias.filter(m => m.mimeType !== 'text/plain');

        // Download text file contents (these go into the prompt, not as media URLs)
        if (textMedias.length > 0) {
          console.log(`[${this.stepName}] Downloading ${textMedias.length} text file(s) for prompt injection...`);
          const textPromises = textMedias.map(async (media) => {
            const buffer = await this.storageService.downloadFile(media.s3Key, media.s3Bucket);
            const fileName = media.s3Key.split('/').pop() || 'pasted-text.txt';
            return { fileName, content: buffer.toString('utf-8') };
          });
          textFileContents = await Promise.all(textPromises);
          console.log(`[${this.stepName}] Downloaded ${textFileContents.length} text file(s)`);
        }

        // Upload non-text media files to public R2 in parallel
        if (nonTextMedias.length > 0) {
          console.log(`[${this.stepName}] Uploading ${nonTextMedias.length} media files to public R2...`);
          const uploadPromises = nonTextMedias.map(async (media) => {
            const { publicKey, publicUrl } = await this.publicMediaStorageService.copyFromS3ToR2(
              media.s3Key,
              media.s3Bucket,
              context.projectId
            );

            // Update media record with public R2 info
            await this.mediaRepository.updatePublicS3Info(media.id, publicKey, process.env.CLOUDFLARE_R2_PUBLIC_MEDIA_BUCKET!);

            return publicUrl;
          });

          publicMediaUrls = await Promise.all(uploadPromises);
        }
        publicR2UploadTimeMs = Date.now() - publicUploadStartTime;
        console.log(`[${this.stepName}] Processed media in ${publicR2UploadTimeMs}ms (${publicMediaUrls.length} uploaded, ${textFileContents.length} text files)`);
      }

      // 3b. Add inspiration image if selected
      const build = await this.buildRepository.findById(context.buildId);
      if (build?.inspoId) {
        console.log(`[${this.stepName}] Build has inspiration reference: ${build.inspoId}`);
        const inspo = await this.inspoRepository.findById(build.inspoId);
        if (inspo) {
          // Prepend inspo image URL to media URLs so AI sees it first
          publicMediaUrls = [inspo.imageUrl, ...publicMediaUrls];
          console.log(`[${this.stepName}] Added inspiration image: ${inspo.name} (${inspo.imageUrl})`);
        }
      }

      // 3c. Separate annotation URLs from regular media URLs
      let annotationUrls: string[] = [];
      let regularMediaUrls = publicMediaUrls;

      if (context.annotationMediaIds && context.annotationMediaIds.length > 0 && context.mediaIds && context.mediaIds.length > 0) {
        const annotationIdSet = new Set(context.annotationMediaIds);
        const medias = await this.mediaRepository.findByIds(context.mediaIds);

        annotationUrls = [];
        regularMediaUrls = [];

        // Map each public URL back to its media ID to determine if it's an annotation
        for (let i = 0; i < medias.length; i++) {
          const publicUrl = publicMediaUrls[build?.inspoId ? i + 1 : i]; // Offset by 1 if inspo image was prepended
          if (publicUrl) {
            if (annotationIdSet.has(medias[i].id)) {
              annotationUrls.push(publicUrl);
            } else {
              regularMediaUrls.push(publicUrl);
            }
          }
        }

        // Re-add inspo URL if present (it's always a regular URL)
        if (build?.inspoId && publicMediaUrls.length > 0) {
          regularMediaUrls = [publicMediaUrls[0], ...regularMediaUrls];
        }

        console.log(`[${this.stepName}] Annotation URLs: ${annotationUrls.length}, Regular media URLs: ${regularMediaUrls.length}`);
      }

      // 4. Determine which AI model to use
      const config = loadAppConfig();
      const hasSuccessfulBuilds = await this.buildRepository.findLatestSuccessfulByProjectId(context.projectId);
      const isFirstBuild = !hasSuccessfulBuilds;
      const useFastModel = !isFirstBuild;

      // Select model based on build type
      const selectedModel = useFastModel ? config.ai.fast.model : config.ai.primary.model;

      const modelReason = isFirstBuild
        ? 'first build (always use primary model for better quality initial setup)'
        : 'iterative build (use fast model for quicker iterations)';
      console.log(`[${this.stepName}] Using ${selectedModel} - Reason: ${modelReason}`);

      // 5. Generate AI response
      const prompt = context.getStepData<string>('userPrompt') || context.userPrompt;
      if (!prompt) {
        throw new Error(`User prompt not found in context for build ${context.buildId}`);
      }

      let enhancedPrompt = prompt;

      // Append text file contents to the prompt
      if (textFileContents.length > 0) {
        for (const textFile of textFileContents) {
          enhancedPrompt += `\n\nUSER ATTACHED TEXT FILE (${textFile.fileName}):\n---\n${textFile.content}\n---`;
        }
        console.log(`[${this.stepName}] Appended ${textFileContents.length} text file(s) to prompt`);
      }

      if (annotationUrls.length > 0) {
        enhancedPrompt += `\n\nANNOTATED SCREENSHOT OF CURRENT APP:\nThe user has drawn annotations (arrows, circles, highlights, text labels) on a screenshot of their current app to indicate specific areas they want changed. The annotated screenshot${annotationUrls.length > 1 ? 's are' : ' is'} included in the attached images. Pay close attention to the annotations - they show exactly what the user wants modified.`;
      }

      console.log(`[${this.stepName}] [PARALLEL] Running AI generation...`);
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(
        enhancedPrompt,
        context.buildId,
        selectedModel,
        regularMediaUrls,
        annotationUrls.length > 0 ? annotationUrls : undefined
      );
      const aiGenerationTimeMs = Date.now() - aiStartTime;
      console.log(`[${this.stepName}] [PARALLEL] AI generation completed in ${aiGenerationTimeMs}ms (Model: ${aiResponse.model})`);

      // 5b. Handle AI question (short-circuit) or summary
      if (aiResponse.aiQuestion) {
        context.setStepData('aiQuestion', aiResponse.aiQuestion);
        console.log(`[${this.stepName}] AI returned clarifying questions - short-circuiting build`);

        const duration = Date.now() - stepStartTime;
        console.log(`[${this.stepName}] Completed (question mode) in ${duration}ms`);

        return {
          success: true,
          metrics: { aiGenerationTimeMs }
        };
      }

      if (aiResponse.aiSummary) {
        context.setStepData('aiSummary', aiResponse.aiSummary);
        console.log(`[${this.stepName}] AI summary: ${aiResponse.aiSummary.substring(0, 100)}...`);
      }

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

      // 7. Scan for image references and cleanup unreferenced images from R2
      if (context.mediaIds && context.mediaIds.length > 0 && publicMediaUrls.length > 0) {
        console.log(`[${this.stepName}] [Image Cleanup] Scanning file tree for image references...`);
        const referencedImages = this.scanFileTreeForImageReferences(mergeResult.mergedFileTree, publicMediaUrls);

        const medias = await this.mediaRepository.findByIds(context.mediaIds);

        for (const media of medias) {
          if (media.s3PublicKey && !referencedImages.has(media.s3PublicKey)) {
            console.log(`[${this.stepName}] [Image Cleanup] Deleting unreferenced image from R2: ${media.s3PublicKey}`);
            try {
              await this.publicMediaStorageService.deleteFile(media.s3PublicKey);
              await this.mediaRepository.updatePublicS3Info(media.id, '', '');
            } catch (error) {
              console.warn(`[${this.stepName}] [Image Cleanup] Failed to delete unreferenced image from R2:`, error);
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
        promptId: context.buildId,  // Using buildId for backward compatibility
        prompt: prompt,
        contextPrompt: prompt,
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
          publicR2UploadTimeMs
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

    // Get the R2 public media base URL for parsing
    const r2BaseUrl = process.env.R2_PUBLIC_MEDIA_BASE_URL;

    for (const url of publicUrls) {
      if (fileTreeString.includes(url)) {
        // Extract key from R2 public URL
        // Format: https://media.huskystudio.app/<projectId>/<filename>
        if (r2BaseUrl) {
          const urlParts = url.split(r2BaseUrl + '/');
          if (urlParts.length > 1) {
            const key = urlParts[1];
            referenced.add(key);
            console.log(`[${this.stepName}] [Image Reference] Found reference to: ${url}`);
          }
        } else {
          // Fallback: try to extract key from URL path
          try {
            const parsedUrl = new URL(url);
            const key = parsedUrl.pathname.substring(1); // Remove leading slash
            referenced.add(key);
            console.log(`[${this.stepName}] [Image Reference] Found reference to: ${url}`);
          } catch {
            console.warn(`[${this.stepName}] [Image Reference] Could not parse URL: ${url}`);
          }
        }
      }
    }

    console.log(`[${this.stepName}] [Image Scan] Found ${referenced.size} referenced images out of ${publicUrls.length} total`);
    return referenced;
  }
}
