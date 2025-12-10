import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../../domain/repositories/IProjectRepository';
import { IStorageService } from '../../../domain/services/IStorageService';
import { IScreenshotService } from '../../../infrastructure/screenshot/ScreenshotService';

/**
 * ScreenshotStep: Captures a screenshot of the preview and saves it as project thumbnail
 *
 * Responsibilities:
 * - Update step_status to CAPTURING_SCREENSHOT
 * - Capture screenshot of the preview URL
 * - Upload screenshot to S3 (key: {projectId}/thumbnails/v{version}.png)
 *
 * Note: This step is non-blocking - failures are logged but don't fail the build
 * Note: Thumbnail URL is constructed on-the-fly from projectId and currentVersion, not stored in DB
 */
export class ScreenshotStep implements IBuildStep {
  readonly stepName = 'Screenshot';
  readonly stepStatus = BuildStepStatus.CAPTURING_SCREENSHOT;

  constructor(
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private storageService: IStorageService,
    private screenshotService: IScreenshotService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Capturing screenshot for project ${context.projectId}...`);

      // Update status
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // Get preview URL - we need to construct it from the project
      const project = await this.projectRepository.findById(context.projectId);
      if (!project?.previewUrl) {
        console.warn(`[${this.stepName}] No preview URL found for project, skipping screenshot`);
        return {
          success: true,
          metrics: { screenshotSkipped: 1 }
        };
      }

      // Get version from context
      if (!context.version) {
        console.warn(`[${this.stepName}] No version in context, skipping screenshot`);
        return {
          success: true,
          metrics: { screenshotSkipped: 1 }
        };
      }

      const metrics: Record<string, number> = {};

      // Capture screenshot
      console.log(`[${this.stepName}] Capturing screenshot of ${project.previewUrl}...`);
      const captureStartTime = Date.now();

      try {
        const screenshotBuffer = await this.screenshotService.captureScreenshot(project.previewUrl, {
          projectId: context.projectId,
          userId: context.userId,
        });
        metrics.screenshotCaptureTimeMs = Date.now() - captureStartTime;
        console.log(`[${this.stepName}] Screenshot captured in ${metrics.screenshotCaptureTimeMs}ms (${screenshotBuffer.length} bytes)`);

        // Upload to S3
        console.log(`[${this.stepName}] Uploading thumbnail to S3...`);
        const uploadStartTime = Date.now();
        const thumbnailKey = await this.storageService.uploadThumbnail(
          context.projectId,
          context.version,
          screenshotBuffer
        );
        metrics.screenshotUploadTimeMs = Date.now() - uploadStartTime;
        console.log(`[${this.stepName}] Thumbnail uploaded in ${metrics.screenshotUploadTimeMs}ms: ${thumbnailKey}`);
        // Note: No need to update project thumbnail_url - URL is constructed on-the-fly from projectId and currentVersion

        metrics.screenshotSuccess = 1;
      } catch (screenshotError) {
        // Log error but don't fail the build
        console.error(`[${this.stepName}] Failed to capture/upload screenshot:`, screenshotError);
        metrics.screenshotCaptureTimeMs = Date.now() - captureStartTime;
        metrics.screenshotFailed = 1;

        const duration = Date.now() - startTime;
        console.log(`[${this.stepName}] Skipped (non-blocking failure) in ${duration}ms`);

        return {
          success: true,
          metrics
        };
      }

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed successfully in ${duration}ms`);

      return {
        success: true,
        metrics
      };
    } catch (error) {
      // Even for unexpected errors, don't fail the build
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Unexpected error:`, error);
      console.log(`[${this.stepName}] Skipped (non-blocking failure) in ${duration}ms`);

      return {
        success: true, // Non-blocking - always return success
        metrics: { screenshotError: 1 }
      };
    }
  }
}
