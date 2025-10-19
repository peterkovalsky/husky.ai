import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IQueueService } from '../../domain/services/IQueueService';
import { CreatePromptDto, CreatePromptResponseDto } from '../dto/CreatePromptDto';
import { User } from '../../domain/entities/User';

export class CreatePromptUseCase {
  constructor(
    private promptRepository: IPromptRepository,
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private queueService: IQueueService,
    private mediaRepository: IMediaRepository
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

    // Validate media IDs if provided
    if (dto.mediaIds && dto.mediaIds.length > 0) {
      const medias = await this.mediaRepository.findByIds(dto.mediaIds);

      // Verify all media IDs exist
      if (medias.length !== dto.mediaIds.length) {
        throw new Error('One or more media IDs not found');
      }

      // Verify all media belongs to the user
      const allOwnedByUser = medias.every(media => media.userId === user.id);
      if (!allOwnedByUser) {
        throw new Error('Unauthorized: One or more media files do not belong to user');
      }
    }

    // Create prompt in database
    const prompt = await this.promptRepository.create({
      prompt: dto.prompt,
      projectId,
      userId: user.id
    });

    // Send message to queue with media IDs
    const message = {
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      prompt: dto.prompt,
      projectId,
      userId: user.id,
      mediaIds: dto.mediaIds || [],
      timestamp: new Date().toISOString()
    };

    console.log(`[CreatePromptUseCase] Sending message to queue with mediaIds:`, message.mediaIds);
    await this.queueService.sendMessage(message);
    console.log(`[CreatePromptUseCase] Message sent to queue successfully`);

    return {
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      status: 'QUEUED', // Default status since build hasn't been created yet
      projectId,
      timestamp: prompt.createdAt
    };
  }
}