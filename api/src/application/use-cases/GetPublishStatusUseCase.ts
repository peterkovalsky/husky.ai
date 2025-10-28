import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { User } from '../../domain/entities/User';
import { PublishingStatus } from '../../domain/entities/Project';

export interface PublishStatusDto {
  status: PublishingStatus;
  publishedAt?: Date;
  publishedUrl?: string;
  publishedVersion?: number;
  currentVersion: number;
  error?: string;
  subdomain?: string;
}

export class GetPublishStatusUseCase {
  constructor(private projectRepository: IProjectRepository) {}

  async execute(projectId: string, user: User): Promise<PublishStatusDto> {
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

    const publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
    const publishedUrl =
      project.publishedStatus === 'PUBLISHED' && project.subdomain
        ? `https://${project.subdomain}.${publishDomain}`
        : undefined;

    // Return generic error message if there's a publishing error
    let errorMessage: string | undefined;
    if (project.publishingError) {
      errorMessage = project.publishedStatus === PublishingStatus.FAILED
        ? 'An error occurred while publishing your project. Please try again.'
        : project.publishingError;
    }

    return {
      status: project.publishedStatus,
      publishedAt: project.publishedAt,
      publishedUrl,
      publishedVersion: project.publishedVersion,
      currentVersion: project.currentVersion,
      error: errorMessage,
      subdomain: project.subdomain,
    };
  }
}
