import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IStorageService } from '../../../domain/services/IStorageService';

/**
 * ProductionUploadStep: Uploads production build to S3
 *
 * Responsibilities:
 * - Update step_status to UPLOADING_PRODUCTION
 * - Upload production build to projects bucket (version/build/)
 * - Track production upload time
 */
export class ProductionUploadStep implements IBuildStep {
  readonly stepName = 'Production Upload';
  readonly stepStatus = BuildStepStatus.UPLOADING_PRODUCTION;

  constructor(
    private buildRepository: IBuildRepository,
    private storageService: IStorageService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Uploading production build for project ${context.projectId}...`);

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

      // Upload production build to projects bucket
      try {
        console.log(`[${this.stepName}] Uploading to projects bucket (v${context.version})...`);
        const productionUploadResult = await this.storageService.uploadProductionVersion(
          appDirectory,
          context.projectId,
          context.version
        );

        if (productionUploadResult.success) {
          metrics.versionProductionUploadTimeMs = Date.now() - startTime;
          console.log(`[${this.stepName}] Production build uploaded in ${metrics.versionProductionUploadTimeMs}ms. Files: ${productionUploadResult.uploadedFiles?.length || 0}`);
        } else {
          console.warn(`[${this.stepName}] Failed to upload production build: ${productionUploadResult.error}`);
          // Log as warning but don't fail the step
        }
      } catch (error) {
        console.warn(`[${this.stepName}] Error uploading production build:`, error);
        // Log as warning but don't fail the step
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
