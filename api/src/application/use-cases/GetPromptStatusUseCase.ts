import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';

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
    private projectRepository: IProjectRepository
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

    // Get preview URL from project
    let previewUrl = null;
    if (prompt.status === 'READY') {
      const project = await this.projectRepository.findById(prompt.projectId);
      previewUrl = project?.previewUrl || null;
    }

    return {
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      status: prompt.status,
      projectId: prompt.projectId,
      createdAt: prompt.createdAt,
      updatedAt: prompt.modifiedAt,
      previewUrl,
      prompt: prompt.prompt
    };
  }
}