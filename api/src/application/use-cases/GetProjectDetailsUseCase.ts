import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IPreviewRepository } from '../../domain/repositories/IPreviewRepository';
import { ProjectDetailsDto } from '../dto/ProjectDto';
import { User } from '../../domain/entities/User';

export class GetProjectDetailsUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository,
    private previewRepository: IPreviewRepository
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
    
    // Get recent prompts (last 10)
    const allPrompts = await this.promptRepository.findByProjectId(projectId);
    const recentPrompts = allPrompts.slice(-10).reverse();
    
    // Get builds/versions
    const builds = await this.buildRepository.findByProjectId(projectId);
    
    // Get previews
    const previews = await this.previewRepository.findByProjectId(projectId);
    
    // Get latest build for current version info
    const latestBuild = await this.buildRepository.findLatestByProjectId(projectId);
    
    return {
      project: {
        id: project.id,
        name: project.name,
        workspaceId: project.workspaceId,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name
      } : null,
      stats: {
        totalPrompts: allPrompts.length,
        totalBuilds: builds.length,
        totalPreviews: previews.length,
        currentVersion: latestBuild?.version || 0
      },
      recentPrompts: recentPrompts.map(prompt => ({
        id: prompt.id,
        prompt: prompt.prompt.length > 100 ? prompt.prompt.substring(0, 100) + '...' : prompt.prompt,
        status: prompt.status,
        createdAt: prompt.createdAt,
        modifiedAt: prompt.modifiedAt
      })),
      builds: builds.slice(0, 5).map(build => ({
        id: build.id,
        version: build.version,
        createdAt: build.createdAt,
        metrics: build.metrics
      })),
      previews: previews.slice(0, 5).map(preview => ({
        id: preview.id,
        previewUrl: preview.previewUrl,
        createdAt: preview.createdAt,
        promptId: preview.promptId
      }))
    };
  }
}