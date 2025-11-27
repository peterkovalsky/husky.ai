import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { mapBuildStatusToFrontend } from '../../domain/utils/statusMapper';
import { BuildStepStatus } from '../build-steps/IBuildStep';

export interface GetPromptStatusResponse {
  promptId: string;
  jobId: string; // for backward compatibility
  status: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  previewUrl: string | null;
  prompt: string;
}

export class GetPromptStatusUseCase {
  constructor(
    private promptRepository: IPromptRepository,
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository
  ) {}

  async execute(promptId: string): Promise<GetPromptStatusResponse> {
    if (!promptId) {
      throw new Error('Prompt ID is required');
    }

    // Get prompt from database
    const prompt = await this.promptRepository.findById(promptId);

    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Get build status if build exists
    let status = 'QUEUED'; // Default status for frontend
    let previewUrl = null;

    if (prompt.buildId) {
      const build = await this.buildRepository.findById(prompt.buildId);
      if (build) {
        // Map detailed build status to frontend-compatible status
        console.log(`[GetPromptStatusUseCase] Build status from DB: '${build.status}', mapping to frontend...`);
        status = mapBuildStatusToFrontend(build.status);
        console.log(`[GetPromptStatusUseCase] Mapped status: '${status}'`);

        // Get preview URL from project if build has reached production/finalization stage
        // These statuses map to READY on the frontend
        const previewReadyStatuses = [
          BuildStepStatus.BUILDING_PRODUCTION,
          BuildStepStatus.UPLOADING_PRODUCTION,
          BuildStepStatus.FINALIZING,
          BuildStepStatus.COMPLETED
        ];

        if (previewReadyStatuses.includes(build.status)) {
          const project = await this.projectRepository.findById(prompt.projectId);
          previewUrl = project?.previewUrl || null;
          console.log(`[GetPromptStatusUseCase] Preview URL from project: '${previewUrl}'`);
        }
      }
    }

    return {
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      status,
      projectId: prompt.projectId,
      createdAt: prompt.createdAt,
      updatedAt: prompt.modifiedAt,
      previewUrl,
      prompt: prompt.prompt
    };
  }
}