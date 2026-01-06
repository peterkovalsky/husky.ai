import { GenerateScreenshotMessage } from '../../domain/services/IQueueService';
import { IStorageService } from '../../domain/services/IStorageService';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IScreenshotService } from '../../infrastructure/screenshot/ScreenshotService';

/**
 * ProcessScreenshotUseCase - Async Screenshot Generation
 *
 * This use case handles screenshot generation asynchronously via SQS.
 * It runs separately from the main build pipeline, allowing builds to
 * complete faster while thumbnails are generated in the background.
 *
 * Benefits:
 * - Build completes ~50s faster (user sees preview immediately)
 * - Screenshot failure doesn't block build completion
 * - Browser can be kept warm for faster subsequent screenshots
 * - Can retry failed screenshots without affecting builds
 */
export class ProcessScreenshotUseCase {
  constructor(
    private screenshotService: IScreenshotService,
    private storageService: IStorageService,
    private buildRepository: IBuildRepository
  ) {}

  async execute(message: GenerateScreenshotMessage): Promise<void> {
    const { buildId, projectId, version, previewUrl, userId } = message;

    console.log(`[ProcessScreenshotUseCase] Starting screenshot generation for build ${buildId}`);
    console.log(`[ProcessScreenshotUseCase] Project: ${projectId}, Version: ${version}`);
    console.log(`[ProcessScreenshotUseCase] URL: ${previewUrl}`);

    const startTime = Date.now();

    try {
      // Capture screenshot using pooled browser
      const screenshotBuffer = await this.screenshotService.captureScreenshot(previewUrl, {
        projectId,
        userId,
      });

      const captureTime = Date.now() - startTime;
      console.log(`[ProcessScreenshotUseCase] Screenshot captured in ${captureTime}ms (${screenshotBuffer.length} bytes)`);

      // Upload to S3
      const uploadStartTime = Date.now();
      const thumbnailKey = await this.storageService.uploadThumbnail(
        projectId,
        version,
        screenshotBuffer
      );

      const uploadTime = Date.now() - uploadStartTime;
      console.log(`[ProcessScreenshotUseCase] Thumbnail uploaded in ${uploadTime}ms: ${thumbnailKey}`);

      // Update build metrics with screenshot times
      try {
        const build = await this.buildRepository.findById(buildId);
        if (build && build.metrics) {
          const updatedMetrics = {
            ...build.metrics,
            screenshotCaptureTimeMs: captureTime,
            screenshotUploadTimeMs: uploadTime,
            screenshotSuccess: 1,
          };
          await this.buildRepository.updateMetrics(buildId, updatedMetrics);
        }
      } catch (metricsError) {
        console.warn(`[ProcessScreenshotUseCase] Failed to update build metrics:`, metricsError);
        // Don't fail the screenshot for metrics update errors
      }

      const totalTime = Date.now() - startTime;
      console.log(`[ProcessScreenshotUseCase] Screenshot completed for build ${buildId} in ${totalTime}ms`);

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[ProcessScreenshotUseCase] Failed to generate screenshot for build ${buildId}:`, error);

      // Update build metrics to indicate screenshot failure
      try {
        const build = await this.buildRepository.findById(buildId);
        if (build && build.metrics) {
          const updatedMetrics = {
            ...build.metrics,
            screenshotCaptureTimeMs: totalTime,
            screenshotFailed: 1,
          };
          await this.buildRepository.updateMetrics(buildId, updatedMetrics);
        }
      } catch (metricsError) {
        console.warn(`[ProcessScreenshotUseCase] Failed to update build metrics:`, metricsError);
      }

      // Don't rethrow - screenshot failure shouldn't cause message to be retried
      // The build is already complete, thumbnail is just a nice-to-have
      console.log(`[ProcessScreenshotUseCase] Screenshot failed but not retrying (build already complete)`);
    }
  }
}
