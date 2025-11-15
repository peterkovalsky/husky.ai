import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IStorageService } from '../../domain/services/IStorageService';
import { IImageProcessingService } from '../../domain/services/IImageProcessingService';
import { JobMessage } from '../../domain/services/IQueueService';
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
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private aiService: IAIService,
    private buildService: IBuildService,
    private storageService: IStorageService,
    private prepareProjectEnvironmentUseCase: PrepareProjectEnvironmentUseCase,
    private mediaRepository: IMediaRepository,
    private imageProcessingService: IImageProcessingService
  ) {}

  async execute(jobMessage: JobMessage): Promise<void> {
    const { promptId, jobId, prompt, projectId, userId, mediaIds } = jobMessage;
    const actualPromptId = promptId || jobId; // Support both old and new message format

    if (!actualPromptId) {
      throw new Error('No prompt ID found in job message');
    }

    if (!projectId) {
      throw new Error('Project ID is required for job processing');
    }

    console.log(`\n========================================`);
    console.log(`Starting build for prompt ${actualPromptId}`);
    console.log(`========================================\n`);

    // Initialize build context
    const context = new BuildStepContext({
      promptId: actualPromptId,
      projectId,
      userId
    });

    // Set initial data
    context.mediaIds = mediaIds;
    context.setStepData('userPrompt', prompt);
    context.setStepData('jobStartTime', Date.now());

    // Create build steps
    const initStep = new InitializationStep(
      this.promptRepository,
      this.buildRepository
    );
    const promptProcessingStep = new UserPromptProcessingStep(
      this.buildRepository,
      this.mediaRepository,
      this.imageProcessingService
    );
    const codeGenStep = new CodeGenerationStep(
      this.promptRepository,
      this.buildRepository,
      this.mediaRepository,
      this.aiService,
      this.storageService,
      this.prepareProjectEnvironmentUseCase
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
      this.projectRepository
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

      // Step 5: Preview Build (with auto-fix retry)
      try {
        await this.executeStep(context, previewBuildStep);
      } catch (buildError) {
        // Build failed - attempt auto-fix
        console.log(`\n⚠️  Preview build failed, attempting auto-fix...`);

        // Store build error in context for AutoFixStep
        const errorMessage = buildError instanceof Error ? buildError.message : String(buildError);
        context.setStepData('buildError', errorMessage);

        try {
          // Run auto-fix step
          await this.executeStep(context, autoFixStep);

          // Re-run file prep and build with fixed code
          console.log(`\n🔄 Retrying build with auto-fixed code...`);
          await this.executeStep(context, filePrepStep);
          await this.executeStep(context, previewBuildStep);

          // Success! Mark auto-fix as successful
          await this.buildRepository.update(context.buildId!, {
            autoFixSuccessful: true
          });
          console.log(`\n✅ Auto-fix successful! Build completed after fix.`);

        } catch (fixError) {
          // Auto-fix failed
          await this.buildRepository.update(context.buildId!, {
            autoFixSuccessful: false,
            errorMessage: fixError instanceof Error ? fixError.message : String(fixError)
          });
          throw fixError;
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
    console.error(`Build failed for prompt ${context.promptId}`);
    console.error(`Error:`, error);
    console.error(`========================================\n`);

    // Update build status if build was created
    if (context.buildId) {
      try {
        await this.buildRepository.updateStatus(context.buildId, 'FAILED');
        await this.buildRepository.updateStepStatus(context.buildId, BuildStepStatus.FAILED);

        // Save metrics even for failed builds (for debugging)
        const metrics = context.getMetrics();
        if (Object.keys(metrics).length > 0) {
          await this.buildRepository.updateMetrics(context.buildId, metrics);
        }

        console.log(`Build ${context.buildId} marked as FAILED`);
      } catch (updateError) {
        console.error(`Failed to update build status:`, updateError);
      }
    }

    // Re-throw error to be handled by queue processor
    throw error;
  }
}
