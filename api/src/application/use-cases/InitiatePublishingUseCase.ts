import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IQueueService, PublishProjectMessage } from '../../domain/services/IQueueService';
import { User } from '../../domain/entities/User';
import { PublishingStatus } from '../../domain/entities/Project';

export class InitiatePublishingUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository,
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

    // Check if already publishing or unpublishing
    if (project.publishedStatus === PublishingStatus.PUBLISHING || project.publishedStatus === PublishingStatus.UNPUBLISHING) {
      throw new Error(`Publishing operation already in progress (status: ${project.publishedStatus})`);
    }

    // Check if project has at least one successful build
    const builds = await this.buildRepository.findByProjectId(projectId);
    const hasSuccessfulBuild = builds.some((build) => build.status === 'READY');

    if (!hasSuccessfulBuild) {
      throw new Error('Cannot publish: project has no successful builds');
    }

    // Ensure project has a subdomain (should have been generated at creation)
    if (!project.subdomain) {
      throw new Error('Project subdomain is not set. Please contact support.');
    }

    // Set status to PUBLISHING
    await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.PUBLISHING);
    await this.projectRepository.updatePublishingError(projectId, null);

    // Queue the publish job
    const message: PublishProjectMessage = {
      action: 'PUBLISH',
      projectId,
      userId: user.id,
      timestamp: new Date().toISOString(),
    };

    await this.queueService.sendMessage(message);

    console.log(`[InitiatePublishingUseCase] Queued publish job for project ${projectId}`);
  }
}
