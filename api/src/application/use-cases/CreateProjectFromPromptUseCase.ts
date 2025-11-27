import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { ISubdomainService } from '../../domain/services/ISubdomainService';
import { IQueueService, ProvisionHostnameMessage } from '../../domain/services/IQueueService';
import { User } from '../../domain/entities/User';
import { Project, HostnameStatus, ProjectStatus } from '../../domain/entities/Project';
import { NotFoundError, QueueError } from '../../shared/errors/AppErrors';

export interface CreateProjectFromPromptDto {
  suggestedName: string;
  workspaceId?: string;
}

export class CreateProjectFromPromptUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private subdomainService: ISubdomainService,
    private queueService: IQueueService
  ) {}

  async execute(dto: CreateProjectFromPromptDto, user: User): Promise<Project> {
    let targetWorkspaceId = dto.workspaceId;

    // If no workspaceId provided, use user's default workspace
    if (!targetWorkspaceId) {
      const workspaces = await this.workspaceRepository.findByUserId(user.id);
      if (workspaces.length === 0) {
        throw new NotFoundError('No workspace found. Please contact support.', {
          userId: user.id,
        });
      }
      targetWorkspaceId = workspaces[0].id;
    }

    // Check for duplicate name in workspace and append date if needed
    let finalName = dto.suggestedName.trim();
    const isTaken = await this.projectRepository.isNameTakenInWorkspace(finalName, targetWorkspaceId);
    if (isTaken) {
      const dateStamp = new Date().toISOString().split('T')[0]; // "2025-11-27"
      finalName = `${finalName} ${dateStamp}`;
      console.log(`[CreateProjectFromPromptUseCase] Name was taken, using: "${finalName}"`);
    }

    // Create the project with status NEW (database default)
    const project = await this.projectRepository.create({
      name: finalName,
      workspaceId: targetWorkspaceId
    });

    console.log(`[CreateProjectFromPromptUseCase] Created project "${finalName}" (${project.id}) with status NEW`);

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
    console.log(`[CreateProjectFromPromptUseCase] Queueing hostname provisioning for project ${project.id} with subdomain ${subdomain}`);
    const provisionMessage: ProvisionHostnameMessage = {
      action: 'PROVISION_HOSTNAME',
      projectId: project.id,
      subdomain: subdomain,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.queueService.sendMessage(provisionMessage);
      console.log(`[CreateProjectFromPromptUseCase] Hostname provisioning queued for project ${project.id}`);
    } catch (error) {
      // Don't fail project creation if queue fails
      console.error(`[CreateProjectFromPromptUseCase] Failed to queue hostname provisioning for project ${project.id}:`, error);
      // Provisioning will happen during first publish as fallback
    }

    // Fetch updated project with subdomain
    const updatedProject = await this.projectRepository.findById(project.id);
    return updatedProject!;
  }
}
