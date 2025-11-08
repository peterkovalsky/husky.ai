import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IStorageService } from '../../domain/services/IStorageService';
import { JobMessage } from '../../domain/services/IQueueService';
import { PrepareProjectEnvironmentUseCase } from './PrepareProjectEnvironmentUseCase';
import { BuildStepContext } from '../build-steps/BuildStepContext';
import { IBuildStep, BuildStepStatus } from '../build-steps/IBuildStep';
import { InitializationStep } from '../build-steps/steps/InitializationStep';
import { CodeGenerationStep } from '../build-steps/steps/CodeGenerationStep';
import { FilePrepStep } from '../build-steps/steps/FilePrepStep';
import { PreviewBuildStep } from '../build-steps/steps/PreviewBuildStep';
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
    private mediaRepository: IMediaRepository
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

    // Create build steps in execution order
    const steps: IBuildStep[] = [
      new InitializationStep(
        this.promptRepository,
        this.buildRepository
      ),
      new CodeGenerationStep(
        this.promptRepository,
        this.buildRepository,
        this.mediaRepository,
        this.aiService,
        this.storageService,
        this.prepareProjectEnvironmentUseCase
      ),
      new FilePrepStep(
        this.buildRepository,
        this.buildService
      ),
      new PreviewBuildStep(
        this.buildRepository,
        this.buildService
      ),
      new PreviewUploadStep(
        this.buildRepository,
        this.projectRepository,
        this.storageService
      ),
      new ProductionBuildStep(
        this.buildRepository,
        this.buildService
      ),
      new ProductionUploadStep(
        this.buildRepository,
        this.storageService
      ),
      new FinalizationStep(
        this.buildRepository,
        this.projectRepository
      )
    ];

    // Execute build steps sequentially
    try {
      for (const step of steps) {
        console.log(`\n--- Executing: ${step.stepName} ---`);
        const result = await step.execute(context);

        if (!result.success) {
          throw result.error || new Error(`${step.stepName} failed without error details`);
        }

        // Aggregate metrics from step
        context.addMetrics(result.metrics);

        console.log(`✓ ${step.stepName} completed successfully`);
      }

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
