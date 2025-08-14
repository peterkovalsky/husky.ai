import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';

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
    let status = 'QUEUED'; // Default status
    let previewUrl = null;
    
    if (prompt.buildId) {
      const build = await this.buildRepository.findById(prompt.buildId);
      if (build) {
        status = build.status;
        
        // Get preview URL from project if build is ready
        if (build.status === 'READY') {
          const project = await this.projectRepository.findById(prompt.projectId);
          previewUrl = project?.previewUrl || null;
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