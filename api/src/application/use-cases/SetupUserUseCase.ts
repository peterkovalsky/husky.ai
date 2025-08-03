import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { User } from '../../domain/entities/User';
import { Workspace } from '../../domain/entities/Workspace';
import { Project } from '../../domain/entities/Project';

export interface SetupUserResponse {
  status: 'existing' | 'created';
  message: string;
  workspace: Workspace;
  project: Project;
}

export class SetupUserUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private projectRepository: IProjectRepository
  ) {}

  async execute(user: User, displayName?: string): Promise<SetupUserResponse> {
    // Check if user already has workspaces
    const existingWorkspaces = await this.workspaceRepository.findByUserId(user.id);
    
    if (existingWorkspaces.length > 0) {
      // User already set up - get their default project
      const projects = await this.projectRepository.findByWorkspaceId(existingWorkspaces[0].id);
      const defaultProject = projects[0] || await this.createDefaultProject(existingWorkspaces[0].id, user.id);
      
      return {
        status: 'existing',
        message: 'User already has workspaces',
        workspace: existingWorkspaces[0],
        project: defaultProject
      };
    }

    // Setup new user
    const workspace = await this.workspaceRepository.create({ name: 'Personal' });
    await this.workspaceRepository.addUserToWorkspace(user.id, workspace.id);
    
    const project = await this.createDefaultProject(workspace.id, user.id);
    
    return {
      status: 'created',
      message: 'User setup completed',
      workspace,
      project
    };
  }

  async getUserDefaultProject(userId: string): Promise<Project | null> {
    const workspaces = await this.workspaceRepository.findByUserId(userId);
    
    if (workspaces.length === 0) {
      // Setup user if they don't have workspaces
      const setup = await this.execute({ id: userId, email: '' });
      return setup.project;
    }

    // Get projects from first workspace (Personal workspace)
    const personalWorkspace = workspaces.find(w => w.name === 'Personal') || workspaces[0];
    const projects = await this.projectRepository.findByWorkspaceId(personalWorkspace.id);
    
    // Return the default project (should be "My Project")
    return projects.find(p => p.name === 'My Project') || projects[0] || null;
  }

  private async createDefaultProject(workspaceId: string, userId: string): Promise<Project> {
    return this.projectRepository.create({
      name: 'My Project',
      workspaceId,
      userId
    });
  }
}