import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IMediaRepository } from '../../../domain/repositories/IMediaRepository';
import { IImageProcessingService } from '../../../domain/services/IImageProcessingService';

/**
 * UserPromptProcessingStep: Processes user-uploaded images before AI generation
 *
 * Responsibilities:
 * - Fetch media records associated with the prompt
 * - Check image dimensions and resize if exceeding limits
 * - Replace oversized images in private S3 bucket
 * - Log warnings for resizing operations
 * - Never fail the build due to image processing errors
 */
export class UserPromptProcessingStep implements IBuildStep {
  readonly stepName = 'UserPromptProcessing';
  readonly stepStatus = BuildStepStatus.PROCESSING_PROMPT;

  constructor(
    private buildRepository: IBuildRepository,
    private mediaRepository: IMediaRepository,
    private imageProcessingService: IImageProcessingService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const buildId = context.buildId;
      console.log(`[${this.stepName}] Processing user prompt images...`);

      // Update status to PROCESSING_PROMPT
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // Check if there are any media IDs to process
      if (!context.mediaIds || context.mediaIds.length === 0) {
        console.log(`[${this.stepName}] No media to process, skipping step`);
        const duration = Date.now() - startTime;
        return {
          success: true,
          metrics: {
            promptProcessingTimeMs: duration
          }
        };
      }

      console.log(`[${this.stepName}] Found ${context.mediaIds.length} media items to process`);

      // Fetch all media records
      const mediaItems = await this.mediaRepository.findByIds(context.mediaIds);
      console.log(`[${this.stepName}] Retrieved ${mediaItems.length} media records`);

      // Process each image
      let imagesProcessed = 0;
      let imagesResized = 0;

      for (const media of mediaItems) {
        try {
          console.log(`[${this.stepName}] Checking image: ${media.s3Key}`);

          // Check and resize image if needed (max dimension: 7500px)
          const s3ProjectsBucket = process.env.S3_PROJECTS_BUCKET_NAME!;
          const result = await this.imageProcessingService.checkAndResizeImage(
            media.s3Key,
            s3ProjectsBucket,
            7500 // Safe margin below Anthropic's 8000px limit
          );

          imagesProcessed++;

          if (result.wasResized) {
            imagesResized++;
            console.log(
              `[${this.stepName}] Resized ${media.s3Key}: ` +
              `${result.originalDimensions.width}x${result.originalDimensions.height} -> ` +
              `${result.newDimensions?.width}x${result.newDimensions?.height}`
            );
          } else {
            console.log(
              `[${this.stepName}] Image ${media.s3Key} is within limits ` +
              `(${result.originalDimensions.width}x${result.originalDimensions.height})`
            );
          }
        } catch (error) {
          // Log error but continue processing other images
          console.warn(
            `[${this.stepName}] Failed to process image ${media.s3Key}:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[${this.stepName}] Completed in ${duration}ms. ` +
        `Processed ${imagesProcessed}/${mediaItems.length} images, ` +
        `resized ${imagesResized}`
      );

      return {
        success: true,
        metrics: {
          promptProcessingTimeMs: duration
        },
        data: {
          imagesProcessed,
          imagesResized
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Failed after ${duration}ms:`, error);

      // Even on failure, we continue with the build
      // The worst case is that oversized images might cause AI errors later
      return {
        success: true, // Don't fail the build
        metrics: {
          promptProcessingTimeMs: duration
        }
      };
    }
  }
}
