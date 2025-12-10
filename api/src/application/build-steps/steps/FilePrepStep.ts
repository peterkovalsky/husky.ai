import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IBuildService } from '../../../domain/services/IBuildService';

/**
 * FilePrepStep: Prepares files for building
 *
 * Responsibilities:
 * - Clean working directory if this is an iterative build
 * - Save merged file tree to disk
 * - Update build status to BUILDING
 * - Update step_status to PREPARING_FILES
 * - Assign version number for this build
 */
export class FilePrepStep implements IBuildStep {
  readonly stepName = 'File Preparation';
  readonly stepStatus = BuildStepStatus.PREPARING_FILES;

  constructor(
    private buildRepository: IBuildRepository,
    private buildService: IBuildService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Preparing files for project ${context.projectId}...`);

      // Update status
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // Check if file tree is available
      if (!context.fileTree) {
        throw new Error('File tree not available in context');
      }

      // Clean working directory if this is an iterative build
      const isIterativeBuild = context.getStepData<boolean>('isIterativeBuild');
      if (isIterativeBuild) {
        console.log(`[${this.stepName}] Cleaning working directory for iterative build...`);
        await this.buildService.cleanWorkingDirectory(context.projectId);
      }

      // Save files to disk (version 0 is used initially, will be updated later)
      console.log(`[${this.stepName}] Saving merged files to disk...`);
      const fileSaveStartTime = Date.now();
      const appDirectory = await this.buildService.saveFileTreeToDisk(
        context.fileTree,
        context.projectId,
        0 // Temporary version, will be updated later
      );
      const fileSaveTimeMs = Date.now() - fileSaveStartTime;

      console.log(`[${this.stepName}] Files saved to: ${appDirectory}`);

      // Assign version number before building (needed for S3 paths)
      const buildVersion = await this.buildRepository.getNextVersionForProject(context.projectId);
      await this.buildRepository.updateVersion(buildId, buildVersion);
      context.version = buildVersion;
      console.log(`[${this.stepName}] Assigned version ${buildVersion} to build ${buildId}`);

      // Store app directory for next steps
      context.setStepData('appDirectory', appDirectory);

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);

      return {
        success: true,
        metrics: {
          filePrepTimeMs: duration,
          fileSaveTimeMs
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
