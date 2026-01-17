import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IInspoRepository } from '../../domain/repositories/IInspoRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IStorageService } from '../../domain/services/IStorageService';
import { IPublicMediaStorageService } from '../../domain/services/IPublicMediaStorageService';
import { IImageProcessingService } from '../../domain/services/IImageProcessingService';
import { JobMessage, IQueueService, GenerateScreenshotMessage } from '../../domain/services/IQueueService';
import { ProjectStatus } from '../../domain/entities/Project';
import { PrepareProjectEnvironmentUseCase } from './PrepareProjectEnvironmentUseCase';
import { BuildStepContext } from '../build-steps/BuildStepContext';
import { IBuildStep, BuildStepStatus } from '../build-steps/IBuildStep';
import { InitializationStep } from '../build-steps/steps/InitializationStep';
import { UserPromptProcessingStep } from '../build-steps/steps/UserPromptProcessingStep';
import { CodeGenerationStep } from '../build-steps/steps/CodeGenerationStep';
import { FilePrepStep } from '../build-steps/steps/FilePrepStep';
import { PreviewBuildStep } from '../build-steps/steps/PreviewBuildStep';
import { AutoFixStep } from '../build-steps/steps/AutoFixStep';
import { PreviewUploadStep } from '../build-steps/steps/PreviewUploadStep';
import { ProductionBuildStep } from '../build-steps/steps/ProductionBuildStep';
import { ProductionUploadStep } from '../build-steps/steps/ProductionUploadStep';
import { FinalizationStep } from '../build-steps/steps/FinalizationStep';
import { loadAppConfig } from '../../shared/config/AppConfig';

/**
 * ProcessJobUseCase - Step-based Build Orchestrator
 *
 * This use case orchestrates the entire build process by executing a series of
 * independent build steps in sequence. Each step is responsible for its own
 * business logic and step_status updates.
 *
 * Responsibilities:
 * - Initialize build context from job message
 * - Execute build steps in sequence
 * - Handle errors and update build status to FAILED
 * - Aggregate metrics from all steps
 *
 * The orchestrator is lightweight (~100 lines) - all business logic is delegated
 * to individual step classes.
 */
export class ProcessJobUseCase {
  constructor(
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private aiService: IAIService,
    private buildService: IBuildService,
    private storageService: IStorageService,
    private prepareProjectEnvironmentUseCase: PrepareProjectEnvironmentUseCase,
    private mediaRepository: IMediaRepository,
    private imageProcessingService: IImageProcessingService,
    private queueService: IQueueService,
    private inspoRepository: IInspoRepository,
    private publicMediaStorageService: IPublicMediaStorageService
  ) {}

  async execute(jobMessage: JobMessage): Promise<void> {
    const { buildId } = jobMessage;

    if (!buildId) {
      throw new Error('No build ID found in job message');
    }

    // Fetch build record to get all required data
    const build = await this.buildRepository.findById(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    // Verify project exists
    const project = await this.projectRepository.findById(build.projectId);
    if (!project) {
      throw new Error(`Project ${build.projectId} not found for build ${buildId}`);
    }

    console.log(`\n========================================`);
    console.log(`Starting build ${buildId}`);
    console.log(`========================================\n`);

    // Initialize build context with data from build record
    const context = new BuildStepContext({
      buildId: build.id,
      projectId: build.projectId,
      userId: build.userId
    });

    // Set initial data from build record
    context.mediaIds = build.mediaIds;
    context.userPrompt = build.userPrompt;
    context.setStepData('userPrompt', build.userPrompt);
    context.setStepData('jobStartTime', Date.now());

    // Create build steps
    const initStep = new InitializationStep(
      this.buildRepository
    );
    const promptProcessingStep = new UserPromptProcessingStep(
      this.buildRepository,
      this.mediaRepository,
      this.imageProcessingService
    );
    const codeGenStep = new CodeGenerationStep(
      this.buildRepository,
      this.mediaRepository,
      this.inspoRepository,
      this.aiService,
      this.storageService,
      this.prepareProjectEnvironmentUseCase,
      this.publicMediaStorageService
    );
    const filePrepStep = new FilePrepStep(
      this.buildRepository,
      this.buildService
    );
    const previewBuildStep = new PreviewBuildStep(
      this.buildRepository,
      this.buildService
    );
    const autoFixStep = new AutoFixStep(
      this.buildRepository,
      this.aiService
    );
    const previewUploadStep = new PreviewUploadStep(
      this.buildRepository,
      this.projectRepository,
      this.storageService
    );
    // Screenshot is now handled asynchronously via SQS queue
    const productionBuildStep = new ProductionBuildStep(
      this.buildRepository,
      this.buildService
    );
    const productionUploadStep = new ProductionUploadStep(
      this.buildRepository,
      this.storageService
    );
    const finalizationStep = new FinalizationStep(
      this.buildRepository,
      this.projectRepository,
      this.workspaceRepository
    );

    // Execute build steps sequentially
    try {
      // Step 1: Initialization
      await this.executeStep(context, initStep);

      // Step 2: User Prompt Processing (resize images if needed)
      await this.executeStep(context, promptProcessingStep);

      // Step 3: Code Generation
      await this.executeStep(context, codeGenStep);

      // Step 4: File Preparation
      await this.executeStep(context, filePrepStep);

      // Step 5: Preview Build (with auto-fix retry loop)
      const config = loadAppConfig();
      const maxAttempts = config.ai.autofixMaxAttempts;
      let attempt = 0;
      let lastError: Error | null = null;
      let buildSucceeded = false;

      while (attempt <= maxAttempts && !buildSucceeded) {
        try {
          await this.executeStep(context, previewBuildStep);
          buildSucceeded = true;

          // If we got here after auto-fix attempts, mark as successful
          if (attempt > 0) {
            await this.buildRepository.update(context.buildId!, {
              autoFixSuccessful: true,
              autoFixAttemptCount: attempt
            });
            console.log(`\n✅ Auto-fix successful! Build completed after ${attempt} attempt(s).`);
          }
        } catch (buildError) {
          lastError = buildError instanceof Error ? buildError : new Error(String(buildError));
          attempt++;

          // Check if we've exhausted all attempts
          if (attempt > maxAttempts) {
            await this.buildRepository.update(context.buildId!, {
              autoFixSuccessful: false,
              autoFixAttemptCount: attempt - 1,
              errorMessage: lastError.message
            });
            console.log(`\n❌ Auto-fix failed after ${attempt - 1} attempt(s). Giving up.`);
            throw lastError;
          }

          // Attempt auto-fix
          console.log(`\n⚠️ Preview build failed. Auto-fix attempt ${attempt}/${maxAttempts}...`);
          context.setStepData('buildError', lastError.message);

          try {
            // Run auto-fix step
            await this.executeStep(context, autoFixStep);

            // Re-run file prep with fixed code
            console.log(`\n🔄 Retrying build with auto-fixed code...`);
            await this.executeStep(context, filePrepStep);
            // Loop will continue and retry previewBuildStep
          } catch (fixError) {
            // Auto-fix step itself failed - continue to next attempt
            lastError = fixError instanceof Error ? fixError : new Error(String(fixError));
          }
        }
      }

      // Step 6: Preview Upload
      await this.executeStep(context, previewUploadStep);

      // Step 7: Production Build
      await this.executeStep(context, productionBuildStep);

      // Step 8: Production Upload
      await this.executeStep(context, productionUploadStep);

      // Step 9: Finalization
      await this.executeStep(context, finalizationStep);

      // Queue async screenshot generation (non-blocking)
      await this.queueScreenshotGeneration(context, project);

      console.log(`\n========================================`);
      console.log(`Build completed successfully!`);
      console.log(`Build ID: ${context.buildId}`);
      console.log(`Version: ${context.version}`);
      console.log(`========================================\n`);

    } catch (error) {
      await this.handleBuildFailure(context, error);
    }
  }

  /**
   * Execute a single build step and aggregate metrics
   */
  private async executeStep(context: BuildStepContext, step: IBuildStep): Promise<void> {
    console.log(`\n--- Executing: ${step.stepName} ---`);
    const result = await step.execute(context);

    if (!result.success) {
      throw result.error || new Error(`${step.stepName} failed without error details`);
    }

    // Aggregate metrics from step
    context.addMetrics(result.metrics);

    console.log(`✓ ${step.stepName} completed successfully`);
  }

  /**
   * Handle build failure by updating status and logging error
   */
  private async handleBuildFailure(context: BuildStepContext, error: any): Promise<void> {
    console.error(`\n========================================`);
    console.error(`Build failed: ${context.buildId}`);
    console.error(`Error:`, error);
    console.error(`========================================\n`);

    // Update build status
    try {
      await this.buildRepository.updateStatus(context.buildId, BuildStepStatus.FAILED);

      // Save metrics even for failed builds (for debugging)
      const metrics = context.getMetrics();
      if (Object.keys(metrics).length > 0) {
        await this.buildRepository.updateMetrics(context.buildId, metrics);
      }

      console.log(`Build ${context.buildId} marked as FAILED`);
    } catch (updateError) {
      console.error(`Failed to update build status:`, updateError);
    }

    // Update project status to FAILED if it's currently NEW (no successful builds yet)
    try {
      const project = await this.projectRepository.findById(context.projectId);
      if (project && project.status === ProjectStatus.NEW) {
        await this.projectRepository.update(context.projectId, { status: ProjectStatus.FAILED });
      }
    } catch (projectUpdateError) {
      console.error(`[ProcessJobUseCase] Failed to update project status:`, projectUpdateError);
      // Don't fail the error handling if project status update fails
    }

    // Re-throw error to be handled by queue processor
    throw error;
  }

  /**
   * Queue async screenshot generation via SQS
   * Screenshot is non-blocking - build is already complete when this runs
   */
  private async queueScreenshotGeneration(context: BuildStepContext, project: any): Promise<void> {
    if (!project.previewUrl || !context.version) {
      console.log(`[ProcessJobUseCase] Skipping screenshot queue - no preview URL or version`);
      return;
    }

    try {
      const screenshotMessage: GenerateScreenshotMessage = {
        action: 'GENERATE_SCREENSHOT',
        buildId: context.buildId,
        projectId: context.projectId,
        version: context.version,
        previewUrl: project.previewUrl,
        userId: context.userId,
        timestamp: new Date().toISOString(),
      };

      await this.queueService.sendMessage(screenshotMessage);
      console.log(`[ProcessJobUseCase] Queued screenshot generation for build ${context.buildId}`);
    } catch (error) {
      // Screenshot queueing failure shouldn't fail the build
      console.warn(`[ProcessJobUseCase] Failed to queue screenshot (non-blocking):`, error);
    }
  }
}
