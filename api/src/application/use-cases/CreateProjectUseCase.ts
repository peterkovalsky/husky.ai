import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { ISubdomainService } from '../../domain/services/ISubdomainService';
import { IQueueService, ProvisionHostnameMessage } from '../../domain/services/IQueueService';
import { CreateProjectDto } from '../dto/ProjectDto';
import { User } from '../../domain/entities/User';
import { Project, HostnameStatus } from '../../domain/entities/Project';
import { ValidationError, AuthorizationError, NotFoundError, QueueError } from '../../shared/errors/AppErrors';

export class CreateProjectUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private subdomainService: ISubdomainService,
    private queueService: IQueueService
  ) {}

  async execute(dto: CreateProjectDto, user: User): Promise<Project> {
    if (!dto.name || typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new ValidationError('Project name is required', { userId: user.id });
    }

    let targetWorkspaceId = dto.workspaceId;

    // If no workspaceId provided, use user's default workspace
    if (!targetWorkspaceId) {
      const workspaces = await this.workspaceRepository.findByUserId(user.id);
      if (workspaces.length === 0) {
        throw new NotFoundError('No workspace found. Please contact support.', {
          userId: user.id,
        });
      }
      targetWorkspaceId = workspaces[0].id; // Use first/default workspace
    } else {
      // Verify user has access to the specified workspace
      const hasAccess = await this.workspaceRepository.checkUserAccess(user.id, targetWorkspaceId);
      if (!hasAccess) {
        throw new AuthorizationError('Access denied to workspace', {
          userId: user.id,
          workspaceId: targetWorkspaceId,
        });
      }
    }

    // Create the project
    const project = await this.projectRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      workspaceId: targetWorkspaceId
    });

    // Generate and set subdomain for the project
    const subdomain = await this.subdomainService.generateUniqueSubdomain(
      (sub) => this.projectRepository.isSubdomainTaken(sub)
    );
    await this.projectRepository.setSubdomain(project.id, subdomain);

    // Initialize hostname status to NONE
    await this.projectRepository.update(project.id, {
      hostnameStatus: HostnameStatus.NONE,
      hostnameError: null,
    });

    // Queue background job to provision custom hostname + SSL
    console.log(`[CreateProjectUseCase] Queueing hostname provisioning for project ${project.id} with subdomain ${subdomain}`);
    const provisionMessage: ProvisionHostnameMessage = {
      action: 'PROVISION_HOSTNAME',
      projectId: project.id,
      subdomain: subdomain,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.queueService.sendMessage(provisionMessage);
      console.log(`[CreateProjectUseCase] Hostname provisioning queued for project ${project.id}`);
    } catch (error) {
      // Don't fail project creation if queue fails
      console.error(`[CreateProjectUseCase] Failed to queue hostname provisioning for project ${project.id}:`, error);
      // Provisioning will happen during first publish as fallback
    }

    // Fetch updated project with subdomain
    const updatedProject = await this.projectRepository.findById(project.id);
    return updatedProject!;
  }
}