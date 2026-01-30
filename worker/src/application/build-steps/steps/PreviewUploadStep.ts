import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../../domain/repositories/IProjectRepository';
import { IStorageService } from '../../../domain/services/IStorageService';

/**
 * PreviewUploadStep: Uploads preview build to preview bucket
 *
 * Responsibilities:
 * - Update step_status to UPLOADING_PREVIEW
 * - Upload preview build to preview bucket
 * - Update project preview URL (if not already set)
 * - Track upload time
 */
export class PreviewUploadStep implements IBuildStep {
  readonly stepName = 'Preview Upload';
  readonly stepStatus = BuildStepStatus.UPLOADING_PREVIEW;

  constructor(
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private storageService: IStorageService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Uploading preview build for project ${context.projectId}...`);

      // Update status
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // Get app directory from previous step
      const appDirectory = context.getStepData<string>('appDirectory');
      if (!appDirectory) {
        throw new Error('App directory not found in context');
      }

      const metrics: Record<string, number> = {};

      // Upload preview build to preview bucket
      console.log(`[${this.stepName}] Uploading to preview bucket...`);
      const previewUploadStartTime = Date.now();
      const uploadResult = await this.storageService.uploadReactApp(
        appDirectory,
        context.buildId,
        context.projectId
      );
      metrics.s3UploadTimeMs = Date.now() - previewUploadStartTime;

      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to preview bucket: ${uploadResult.error}`);
      }

      console.log(`[${this.stepName}] Preview bucket upload completed in ${metrics.s3UploadTimeMs}ms`);

      // Note: previewUrl is now constructed on-the-fly in the API, not stored in DB

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);

      return {
        success: true,
        metrics
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Failed after ${duration}ms:`, error);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}
