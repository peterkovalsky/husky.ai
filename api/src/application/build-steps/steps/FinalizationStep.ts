import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { BuildMetrics } from '../../../domain/entities/Build';
import { ProjectStatus } from '../../../domain/entities/Project';

/**
 * FinalizationStep: Completes the build process
 *
 * Responsibilities:
 * - Update step_status to FINALIZING
 * - Calculate total build time
 * - Update build status to COMPLETED
 * - Update build metrics with all accumulated data
 * - Update project's current_version
 * - Consume credit from workspace (only on successful build)
 * - Update step_status to COMPLETED
 * - Log final metrics and completion
 */
export class FinalizationStep implements IBuildStep {
  readonly stepName = 'Finalization';
  readonly stepStatus = BuildStepStatus.FINALIZING;

  constructor(
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.requireBuildId();

    try {
      console.log(`[${this.stepName}] Finalizing build for project ${context.projectId}...`);

      // Update status to FINALIZING
      await this.buildRepository.updateStatus(buildId, this.stepStatus);

      // Get version from context
      if (!context.version) {
        throw new Error('Build version not set in context');
      }

      // Get job start time from context (set at the beginning of orchestration)
      const jobStartTime = context.getStepData<number>('jobStartTime') || startTime;
      const totalTimeMs = Date.now() - jobStartTime;

      // Get all accumulated metrics
      const metrics: BuildMetrics = {
        ...context.getMetrics(),
        totalTimeMs
      };

      // Update build status to COMPLETED
      await this.buildRepository.updateStatus(buildId, BuildStepStatus.COMPLETED);
      console.log(`[${this.stepName}] Build status updated to COMPLETED`);

      // Update build metrics
      try {
        await this.buildRepository.updateMetrics(buildId, metrics);
        console.log(`[${this.stepName}] Build metrics updated successfully`);
      } catch (metricsError) {
        console.warn(`[${this.stepName}] Failed to update build metrics:`, metricsError);
      }

      // Update project's current_version
      try {
        await this.projectRepository.updateCurrentVersion(context.projectId, context.version);
        console.log(`[${this.stepName}] Updated project current_version to ${context.version}`);
      } catch (versionError) {
        console.warn(`[${this.stepName}] Failed to update current_version:`, versionError);
      }

      // Consume credit from workspace (only on successful build)
      try {
        const project = await this.projectRepository.findById(context.projectId);
        if (project) {
          await this.workspaceRepository.consumeCredit(project.workspaceId);
          console.log(`[${this.stepName}] Consumed 1 credit from workspace ${project.workspaceId}`);
        }
      } catch (creditError) {
        console.warn(`[${this.stepName}] Failed to consume credit:`, creditError);
        // Don't fail the build if credit consumption fails - it's already built successfully
      }

      // Update project status to ACTIVE (has at least one successful build)
      try {
        await this.projectRepository.update(context.projectId, { status: ProjectStatus.ACTIVE });
        console.log(`[${this.stepName}] Updated project status to ACTIVE`);
      } catch (statusError) {
        console.warn(`[${this.stepName}] Failed to update project status:`, statusError);
        // Don't fail the build if status update fails
      }

      // Log completion with detailed metrics
      console.log(`\n[${this.stepName}] Build completed successfully!`);
      console.log(`=== Build Metrics Breakdown ===`);
      console.log(`PARALLEL PHASE:`);
      console.log(`  AI Generation:        ${metrics.aiGenerationTimeMs || 0}ms`);
      console.log(`  Environment Prep:     ${metrics.environmentPrepTimeMs || 0}ms (ran in parallel with AI)`);
      console.log(`    - node_modules:     ${metrics.nodeModulesCopyTimeMs || 0}ms ${metrics.nodeModulesCopyTimeMs ? '(copied from template)' : '(already exists)'}`);
      console.log(`SETUP PHASE:`);
      console.log(`  Public S3 Upload:     ${metrics.publicS3UploadTimeMs || 0}ms`);
      console.log(`  File Preparation:     ${metrics.filePrepTimeMs || 0}ms`);
      console.log(`BUILD & UPLOAD PHASE:`);
      console.log(`  npm install:          ${metrics.dependencyInstallTimeMs || 0}ms ${metrics.dependencyInstallTimeMs === 0 ? '(skipped - package.json unchanged)' : ''}`);
      console.log(`  Preview Build:        ${metrics.buildTimeMs || 0}ms`);
      console.log(`  Preview Upload (S3):  ${metrics.s3UploadTimeMs || 0}ms`);
      console.log(`  Source Upload:        ${metrics.versionSourceUploadTimeMs || 0}ms`);
      console.log(`  Version Preview:      ${metrics.versionPreviewUploadTimeMs || 0}ms`);
      console.log(`  Production Build:     ${metrics.productionBuildTimeMs || 0}ms`);
      console.log(`  Production Upload:    ${metrics.versionProductionUploadTimeMs || 0}ms`);
      console.log(`TOTAL TIME:             ${totalTimeMs}ms`);
      console.log(`================================\n`);

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Finalization completed in ${duration}ms`);

      return {
        success: true,
        metrics: {
          finalizationTimeMs: duration,
          totalTimeMs
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
