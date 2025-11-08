import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IBuildService } from '../../../domain/services/IBuildService';

/**
 * PreviewBuildStep: Builds the app with project-specific base path
 *
 * Responsibilities:
 * - Update step_status to BUILDING_PREVIEW
 * - Run npm install if needed (based on package.json hash)
 * - Execute npm build with VITE_BASE_PATH=/projects/{id}/
 * - Track build and dependency install times
 */
export class PreviewBuildStep implements IBuildStep {
  readonly stepName = 'Preview Build';
  readonly stepStatus = BuildStepStatus.BUILDING_PREVIEW;

  constructor(
    private buildRepository: IBuildRepository,
    private buildService: IBuildService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.requireBuildId();

    try {
      console.log(`[${this.stepName}] Building preview app for project ${context.projectId}...`);

      // Update step status
      await this.buildRepository.updateStepStatus(buildId, this.stepStatus);

      // Get app directory from previous step
      const appDirectory = context.getStepData<string>('appDirectory');
      if (!appDirectory) {
        throw new Error('App directory not found in context');
      }

      // Build the app with project-specific base path
      console.log(`[${this.stepName}] Running build for app directory: ${appDirectory}`);
      const buildResult = await this.buildService.buildApp(appDirectory, context.projectId);

      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error || "Unknown build error"}`);
      }

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);
      console.log(`[${this.stepName}] - Dependency install: ${buildResult.dependencyInstallTime || 0}ms`);
      console.log(`[${this.stepName}] - Build time: ${buildResult.buildTime || 0}ms`);

      return {
        success: true,
        metrics: {
          dependencyInstallTimeMs: buildResult.dependencyInstallTime || 0,
          buildTimeMs: buildResult.buildTime || 0
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
