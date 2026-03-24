import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IChatMessageRepository } from '../../domain/repositories/IChatMessageRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { ProjectDetailsDto } from '../dto/ProjectDto';
import { User } from '../../domain/entities/User';
import { mapBuildStatusToFrontend } from '../../domain/utils/statusMapper';

export class GetProjectDetailsUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private buildRepository: IBuildRepository,
    private chatMessageRepository: IChatMessageRepository,
    private mediaRepository: IMediaRepository,
    private storageService: IStorageService
  ) {}

  async execute(projectId: string, user: User): Promise<ProjectDetailsDto> {
    // Get project details
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Get workspace details
    const workspaces = await this.workspaceRepository.findByUserId(user.id);
    const workspace = workspaces.find(w => w.id === project.workspaceId);

    // Get all builds (builds are now the source of truth for prompts)
    const builds = await this.buildRepository.findByProjectId(projectId);

    // Get recent builds as "prompts" (last 10, sorted by creation date desc)
    // Builds are already ordered by version desc, so we take the first 10
    const recentBuilds = builds.slice(0, 10);

    // Get latest build for current version info
    const latestBuild = await this.buildRepository.findLatestByProjectId(projectId);

    // Construct previewUrl on-the-fly instead of reading from DB
    // Only show preview URL if project has at least one successful build
    const previewUrl = latestBuild && latestBuild.version > 0
      ? this.storageService.getPreviewUrl(project.id)
      : undefined;

    return {
      project: {
        id: project.id,
        name: project.name,
        workspaceId: project.workspaceId,
        previewUrl,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name
      } : null,
      stats: {
        totalPrompts: builds.length,  // Now builds count as prompts
        totalBuilds: builds.length,
        totalPreviews: previewUrl ? 1 : 0,
        currentVersion: latestBuild?.version || 0
      },
      recentPrompts: recentBuilds.map(build => ({
        id: build.id,
        prompt: build.userPrompt.length > 100 ? build.userPrompt.substring(0, 100) + '...' : build.userPrompt,
        status: mapBuildStatusToFrontend(build.status),
        createdAt: build.createdAt,
        modifiedAt: build.modifiedAt
      })),
      builds: builds.slice(0, 5).map(build => ({
        id: build.id,
        version: build.version,
        createdAt: build.createdAt,
        metrics: build.metrics
      })),
      previews: previewUrl ? [{
        id: project.id,
        previewUrl: previewUrl,
        createdAt: project.createdAt,
        promptId: undefined
      }] : [],
      chatMessages: undefined
    };
  }

}