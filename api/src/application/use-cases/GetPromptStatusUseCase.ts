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
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository
  ) {}

  async execute(buildId: string): Promise<GetPromptStatusResponse> {
    if (!buildId) {
      throw new Error('Build ID is required');
    }

    // Get build from database (builds are now the source of truth)
    const build = await this.buildRepository.findById(buildId);

    if (!build) {
      throw new Error('Build not found');
    }

    // Map detailed build status to frontend-compatible status
    const status = mapBuildStatusToFrontend(build.status);

    // Get preview URL from project if build has reached production/finalization stage
    // These statuses map to READY on the frontend
    let previewUrl = null;
    const previewReadyStatuses = [
      BuildStepStatus.BUILDING_PRODUCTION,
      BuildStepStatus.UPLOADING_PRODUCTION,
      BuildStepStatus.FINALIZING,
      BuildStepStatus.COMPLETED
    ];

    if (previewReadyStatuses.includes(build.status)) {
      const project = await this.projectRepository.findById(build.projectId);
      previewUrl = project?.previewUrl || null;
    }

    return {
      promptId: build.id,  // For backward compatibility
      jobId: build.id,
      status,
      projectId: build.projectId,
      createdAt: build.createdAt,
      updatedAt: build.modifiedAt,
      previewUrl,
      prompt: build.userPrompt
    };
  }
}