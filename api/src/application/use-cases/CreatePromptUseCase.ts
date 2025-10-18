import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IQueueService } from '../../domain/services/IQueueService';
import { CreatePromptDto, CreatePromptResponseDto } from '../dto/CreatePromptDto';
import { User } from '../../domain/entities/User';

export class CreatePromptUseCase {
  constructor(
    private promptRepository: IPromptRepository,
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private queueService: IQueueService
  ) {}

  async execute(dto: CreatePromptDto, user: User): Promise<CreatePromptResponseDto> {
    if (!dto.prompt || typeof dto.prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }

    let projectId = dto.projectId;

    // Project ID is required
    if (!projectId) {
      throw new Error('projectId is required. Please specify which project to build.');
    }

    // Verify user has access to the specified project
    const hasAccess = await this.projectRepository.checkUserAccess(user.id, projectId);
    if (!hasAccess) {
      throw new Error('Access denied to project');
    }

    // Create prompt in database
    const prompt = await this.promptRepository.create({
      prompt: dto.prompt,
      projectId,
      userId: user.id
    });

    // Send message to queue
    const message = {
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      prompt: dto.prompt,
      projectId,
      userId: user.id,
      timestamp: new Date().toISOString()
    };

    await this.queueService.sendMessage(message);

    return {
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      status: 'QUEUED', // Default status since build hasn't been created yet
      projectId,
      timestamp: prompt.createdAt
    };
  }
}