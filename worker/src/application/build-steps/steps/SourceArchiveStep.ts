import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IStorageService } from '../../../domain/services/IStorageService';

/**
 * SourceArchiveStep: Archives source code and preview build to projects bucket
 *
 * Responsibilities:
 * - Update step_status to ARCHIVING_SOURCE
 * - Upload source code to projects bucket (version/source/)
 * - Upload preview build to projects bucket (version/preview/)
 * - Both uploads are best-effort (warn on failure, don't fail the step)
 * - Track upload times for each operation
 *
 * This step runs after PreviewUploadStep so the user already sees READY
 * while archiving happens in the background (from the user's perspective).
 */
export class SourceArchiveStep implements IBuildStep {
  readonly stepName = 'Source Archive';
  readonly stepStatus = BuildStepStatus.ARCHIVING_SOURCE;

  constructor(
    private buildRepository: IBuildRepository,
    private storageService: IStorageService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Archiving source and build for project ${context.projectId}...`);

      // Update status
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

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

      // 1. Upload source code to projects bucket
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

      // 2. Upload preview build to projects bucket
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
