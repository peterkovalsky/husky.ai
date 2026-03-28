import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IBuildService } from '../../../domain/services/IBuildService';
import fs from 'fs';
import path from 'path';

/**
 * ProductionBuildStep: Builds the app with root base path for production
 *
 * Responsibilities:
 * - Update step_status to BUILDING_PRODUCTION
 * - Clean dist folder (remove preview build)
 * - Execute npm build with VITE_BASE_PATH=/
 * - Track production build time
 */
export class ProductionBuildStep implements IBuildStep {
  readonly stepName = 'Production Build';
  readonly stepStatus = BuildStepStatus.BUILDING_PRODUCTION;

  constructor(
    private buildRepository: IBuildRepository,
    private buildService: IBuildService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Building production app for project ${context.projectId}...`);

      // Update status
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // Get app directory from previous step
      const appDirectory = context.getStepData<string>('appDirectory');
      if (!appDirectory) {
        throw new Error('App directory not found in context');
      }

      // Clean dist folder before production build
      console.log(`[${this.stepName}] Cleaning dist folder...`);
      const distPath = path.join(appDirectory, "dist");
      if (fs.existsSync(distPath)) {
        fs.rmSync(distPath, { recursive: true, force: true });
        console.log(`[${this.stepName}] Dist folder cleaned`);
      }

      // Build production version with root path
      console.log(`[${this.stepName}] Running production build with root path...`);
      const productionBuildResult = await this.buildService.buildAppWithBasePath(appDirectory, "/", context.template);

      if (!productionBuildResult.success) {
        console.warn(`[${this.stepName}] Production build failed: ${productionBuildResult.error || "Unknown build error"}`);
        // Note: Production build failure is logged but not thrown - process continues
      }

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);

      return {
        success: true,
        metrics: {
          productionBuildTimeMs: duration
        },
        data: {
          buildSuccess: productionBuildResult.success
        }
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
