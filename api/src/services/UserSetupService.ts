import { DatabaseService } from './DatabaseService';

export class UserSetupService {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = new DatabaseService();
  }

  async setupNewUser(userId: string, displayName?: string) {
    try {
      console.log(`Setting up new user: ${userId}`);
      
      // Check if user already has workspaces (should only be called when they don't)
      const existingWorkspaces = await this.dbService.getWorkspacesByUserId(userId);
      
      if (existingWorkspaces.length > 0) {
        console.log(`User ${userId} already has ${existingWorkspaces.length} workspace(s), skipping creation`);
        // Return the first workspace and its first project
        const workspace = existingWorkspaces[0];
        const projects = await this.dbService.getProjectsByWorkspaceId(workspace.id);
        const defaultProject = projects[0];
        return { workspace, project: defaultProject };
      }

      // Create default workspace and project
      console.log(`Creating new workspace and project for user ${userId}`);
      const { workspace, project } = await this.dbService.setupDefaultUserData(userId, displayName);
      
      console.log(`Successfully created default workspace (${workspace.id}) and project (${project.id}) for user ${userId}`);
      
      return { workspace, project };
    } catch (error) {
      console.error(`Failed to setup user ${userId}:`, error);
      throw error;
    }
  }

  async getUserDefaultProject(userId: string) {
    try {
      const workspaces = await this.dbService.getWorkspacesByUserId(userId);
      
      if (workspaces.length === 0) {
        // Setup user if they don't have workspaces
        const setup = await this.setupNewUser(userId);
        return setup?.project;
      }

      // Get projects from first workspace (Personal workspace)
      const personalWorkspace = workspaces.find(w => w.name === 'Personal') || workspaces[0];
      const projects = await this.dbService.getProjectsByWorkspaceId(personalWorkspace.id);
      
      // Return the default project (should be "My Project")
      return projects.find(p => p.name === 'My Project') || projects[0];
    } catch (error) {
      console.error(`Failed to get default project for user ${userId}:`, error);
      throw error;
    }
  }
}

export const userSetupService = new UserSetupService();