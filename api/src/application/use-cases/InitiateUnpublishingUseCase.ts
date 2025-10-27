import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IQueueService, UnpublishProjectMessage } from '../../domain/services/IQueueService';
import { User } from '../../domain/entities/User';
import { PublishingStatus } from '../../domain/entities/Project';

export class InitiateUnpublishingUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private queueService: IQueueService
  ) {}

  async execute(projectId: string, user: User): Promise<void> {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    // Verify user has access to the project
    const hasAccess = await this.projectRepository.checkUserAccess(user.id, projectId);
    if (!hasAccess) {
      throw new Error('Access denied to project');
    }

    // Get the project
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if project is published
    if (project.publishedStatus !== PublishingStatus.PUBLISHED) {
      throw new Error(`Cannot unpublish: project is not published (status: ${project.publishedStatus})`);
    }

    // Set status to UNPUBLISHING
    await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.UNPUBLISHING);
    await this.projectRepository.updatePublishingError(projectId, null);

    // Queue the unpublish job
    const message: UnpublishProjectMessage = {
      action: 'UNPUBLISH',
      projectId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    };

    await this.queueService.sendMessage(message);

    console.log(`[InitiateUnpublishingUseCase] Queued unpublish job for project ${projectId}`);
  }
}
