import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IStorageService } from '../../domain/services/IStorageService';
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
    private buildRepository: IBuildRepository,
    private storageService: IStorageService
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

    // Get preview URL from project once preview upload is complete (screenshot step onwards)
    // These statuses map to READY on the frontend
    let previewUrl = null;
    const previewReadyStatuses = [
      BuildStepStatus.ARCHIVING_SOURCE,
      BuildStepStatus.CAPTURING_SCREENSHOT,
      BuildStepStatus.BUILDING_PRODUCTION,
      BuildStepStatus.UPLOADING_PRODUCTION,
      BuildStepStatus.FINALIZING,
      BuildStepStatus.COMPLETED
    ];

    if (previewReadyStatuses.includes(build.status)) {
      // Construct previewUrl on-the-fly instead of reading from DB
      previewUrl = this.storageService.getPreviewUrl(build.projectId);
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