import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../../domain/repositories/IProjectRepository';
import { IStorageService } from '../../../domain/services/IStorageService';

/**
 * PreviewUploadStep: Uploads preview build and source code to S3
 *
 * Responsibilities:
 * - Update step_status to UPLOADING_PREVIEW
 * - Upload preview build to preview bucket
 * - Update project preview URL (if not already set)
 * - Upload source code to projects bucket (version/source/)
 * - Upload preview build to projects bucket (version/preview/)
 * - Track upload times for each operation
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
    const buildId = context.requireBuildId();

    try {
      console.log(`[${this.stepName}] Uploading preview build for project ${context.projectId}...`);

      // Update step status
      await this.buildRepository.updateStepStatus(buildId, this.stepStatus);

      // Get app directory from previous step
      const appDirectory = context.getStepData<string>('appDirectory');
      if (!appDirectory) {
        throw new Error('App directory not found in context');
      }

      // Get version from context
      if (!context.version) {
        throw new Error('Build version not set in context');
      }

      const metrics: Record<string, number> = {};

      // 1. Upload preview build to preview bucket
      console.log(`[${this.stepName}] Uploading to preview bucket...`);
      const previewUploadStartTime = Date.now();
      const uploadResult = await this.storageService.uploadReactApp(
        appDirectory,
        context.promptId,
        context.projectId
      );
      metrics.s3UploadTimeMs = Date.now() - previewUploadStartTime;

      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to preview bucket: ${uploadResult.error}`);
      }

      console.log(`[${this.stepName}] Preview bucket upload completed in ${metrics.s3UploadTimeMs}ms`);

      // Update project preview URL (only if not already set)
      if (uploadResult.previewUrl) {
        const project = await this.projectRepository.findById(context.projectId);
        if (project && !project.previewUrl) {
          await this.projectRepository.updatePreviewUrl(context.projectId, uploadResult.previewUrl);
          console.log(`[${this.stepName}] Updated project preview URL: ${uploadResult.previewUrl}`);
        }
      }

      // 2. Upload source code to projects bucket
      try {
        console.log(`[${this.stepName}] Uploading source code to projects bucket (v${context.version})...`);
        const sourceUploadStartTime = Date.now();
        const sourceUploadResult = await this.storageService.uploadSourceCode(
          appDirectory,
          context.projectId,
          context.version
        );

        if (sourceUploadResult.success) {
          metrics.versionSourceUploadTimeMs = Date.now() - sourceUploadStartTime;
          console.log(`[${this.stepName}] Source code uploaded in ${metrics.versionSourceUploadTimeMs}ms. Files: ${sourceUploadResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`[${this.stepName}] Failed to upload source code: ${sourceUploadResult.error}`);
        }
      } catch (error) {
        console.warn(`[${this.stepName}] Error uploading source code:`, error);
        // Continue with other uploads even if this fails
      }

      // 3. Upload preview build to projects bucket
      try {
        console.log(`[${this.stepName}] Uploading preview build to projects bucket (v${context.version})...`);
        const versionPreviewStartTime = Date.now();
        const versionPreviewResult = await this.storageService.uploadPreviewVersion(
          appDirectory,
          context.projectId,
          context.version
        );

        if (versionPreviewResult.success) {
          metrics.versionPreviewUploadTimeMs = Date.now() - versionPreviewStartTime;
          console.log(`[${this.stepName}] Preview build uploaded in ${metrics.versionPreviewUploadTimeMs}ms. Files: ${versionPreviewResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`[${this.stepName}] Failed to upload preview build: ${versionPreviewResult.error}`);
        }
      } catch (error) {
        console.warn(`[${this.stepName}] Error uploading preview build:`, error);
        // Continue even if this fails
      }

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
