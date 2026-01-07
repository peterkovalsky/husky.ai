import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import path from 'path';

/**
 * InitializationStep: Validates build exists and prepares context
 *
 * Responsibilities:
 * - Validate build exists (created by CreatePromptUseCase)
 * - Check for duplicate processing (build already past INITIALIZING status)
 * - Update build status to PROCESSING_PROMPT
 * - Initialize working directory path in context
 */
export class InitializationStep implements IBuildStep {
  readonly stepName = 'Initialization';
  readonly stepStatus = BuildStepStatus.INITIALIZING;

  constructor(
    private buildRepository: IBuildRepository
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();

    try {
      console.log(`[${this.stepName}] Validating build ${context.buildId}...`);

      // Validate build exists (already created by CreatePromptUseCase)
      const build = await this.buildRepository.findById(context.buildId);
      if (!build) {
        throw new Error(`Build ${context.buildId} not found`);
      }

      // Check for duplicate processing
      if (build.status !== BuildStepStatus.INITIALIZING) {
        console.log(`[${this.stepName}] Build ${context.buildId} already being processed (status: ${build.status}), skipping duplicate processing`);
        return {
          success: false,
          error: new Error(`Build already being processed with status ${build.status}`)
        };
      }

      console.log(`[${this.stepName}] Build validated, updating status...`);

      // Update status to indicate processing has started
      await this.buildRepository.updateStatus(context.buildId, BuildStepStatus.PROCESSING_PROMPT);

      // Set context data from build record
      context.mediaIds = build.mediaIds;
      context.userPrompt = build.userPrompt;
      context.setStepData('userPrompt', build.userPrompt);

      // Initialize working directory path
      context.workingDirectory = path.join(process.cwd(), 'projects', context.projectId, 'web');
      console.log(`[${this.stepName}] Working directory: ${context.workingDirectory}`);

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);

      return {
        success: true,
        metrics: {
          initializationTimeMs: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Failed after ${duration}ms:`, error);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        metrics: {
          initializationTimeMs: duration
        }
      };
    }
  }
}
