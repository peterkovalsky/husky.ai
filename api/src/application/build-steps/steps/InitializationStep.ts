import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IPromptRepository } from '../../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import path from 'path';

/**
 * InitializationStep: Validates job message and creates build record
 *
 * Responsibilities:
 * - Validate prompt ID and project ID exist
 * - Check for duplicate processing (prompt already has a build)
 * - Create build record with PROCESSING status and INITIALIZING step_status
 * - Link prompt to build
 * - Initialize working directory path in context
 */
export class InitializationStep implements IBuildStep {
  readonly stepName = 'Initialization';
  readonly stepStatus = BuildStepStatus.INITIALIZING;

  constructor(
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();

    try {
      console.log(`[${this.stepName}] Validating prompt ${context.promptId}...`);

      // Validate prompt exists
      const existingPrompt = await this.promptRepository.findById(context.promptId);
      if (!existingPrompt) {
        throw new Error(`Prompt ${context.promptId} not found`);
      }

      // Check for duplicate processing
      if (existingPrompt.buildId) {
        console.log(`[${this.stepName}] Prompt ${context.promptId} already has build ${existingPrompt.buildId}, skipping duplicate processing`);
        return {
          success: false,
          error: new Error(`Prompt already processed with build ${existingPrompt.buildId}`)
        };
      }

      console.log(`[${this.stepName}] Creating build record...`);

      // Create build with INITIALIZING status
      const createdBuild = await this.buildRepository.create({
        fileTree: {},
        projectId: context.projectId,
        status: BuildStepStatus.INITIALIZING,
        mediaIds: context.mediaIds || []
      });

      console.log(`[${this.stepName}] Build created with ID: ${createdBuild.id}`);

      // Link prompt to build
      await this.promptRepository.updateBuildId(context.promptId, createdBuild.id);
      console.log(`[${this.stepName}] Linked prompt ${context.promptId} to build ${createdBuild.id}`);

      // Set build ID in context for subsequent steps
      context.buildId = createdBuild.id;

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
