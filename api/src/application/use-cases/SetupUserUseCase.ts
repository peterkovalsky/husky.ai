import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IEmailService } from '../../domain/services/IEmailService';
import { User } from '../../domain/entities/User';
import { Workspace } from '../../domain/entities/Workspace';
import { Project } from '../../domain/entities/Project';

export interface SetupUserResponse {
  status: 'existing' | 'created';
  message: string;
  workspace: Workspace;
  project?: Project; // Optional - new users won't have a project until they create one
}

export class SetupUserUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private projectRepository: IProjectRepository,
    private emailService?: IEmailService
  ) {}

  async execute(user: User, displayName?: string): Promise<SetupUserResponse> {
    const timestamp = new Date().toISOString();
    console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: Starting setup for user:`, user.id);

    // Check if user already has workspaces (database is the source of truth)
    const existingWorkspaces = await this.workspaceRepository.findByUserId(user.id);
    console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: Found ${existingWorkspaces.length} existing workspaces for user:`, user.id);
    
    if (existingWorkspaces.length > 0) {
      // User already set up - get their first project if any
      console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: User already has workspaces, returning existing setup`);
      const projects = await this.projectRepository.findByWorkspaceId(existingWorkspaces[0].id);

      return {
        status: 'existing',
        message: 'User already has workspaces',
        workspace: existingWorkspaces[0],
        project: projects[0] // May be undefined if user has no projects yet
      };
    }

    // Use database-level protection against race conditions
    console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: Creating new workspace for user:`, user.id);
    
    try {
      // Create workspace and add user atomically
      const workspace = await this.workspaceRepository.create({ name: 'Personal' });
      await this.workspaceRepository.addUserToWorkspace(user.id, workspace.id);

      // Send welcome email (fire-and-forget — never block signup)
      if (this.emailService) {
        console.log(`[SetupUserUseCase] Sending welcome email to ${user.email}`);
        this.emailService.sendWelcomeEmail(user.email, displayName || user.displayName).catch((err) => {
          console.error(`[SetupUserUseCase] Failed to send welcome email to ${user.email}:`, err.message);
        });
      } else {
        console.log(`[SetupUserUseCase] Email service not configured, skipping welcome email`);
      }

      // Note: We no longer create a default project - users create their first project via /project/new
      console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: Setup completed successfully for user:`, user.id);
      return {
        status: 'created',
        message: 'User setup completed',
        workspace
        // No project - user will create via /project/new with AI-generated name
      };
    } catch (error: any) {
      // If setup fails, check if another concurrent request succeeded
      console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: Error during setup, checking for existing workspaces:`, error.message);
      
      const retryWorkspaces = await this.workspaceRepository.findByUserId(user.id);
      if (retryWorkspaces.length > 0) {
        console.log(`🚀 [${timestamp}] SetupUserUseCase.execute: Found workspaces on retry, returning existing setup`);
        const projects = await this.projectRepository.findByWorkspaceId(retryWorkspaces[0].id);

        return {
          status: 'existing',
          message: 'User setup completed by concurrent request',
          workspace: retryWorkspaces[0],
          project: projects[0] // May be undefined
        };
      }
      
      // If we still don't have workspaces, re-throw the error
      throw error;
    }
  }

  async getUserDefaultProject(userId: string): Promise<Project | null> {
    const workspaces = await this.workspaceRepository.findByUserId(userId);

    if (workspaces.length === 0) {
      // User has no workspaces, which means they haven't been set up properly
      // Don't create setup here - let the explicit setup endpoint handle it
      return null;
    }

    // Get projects from first workspace (Personal workspace)
    const personalWorkspace = workspaces.find(w => w.name === 'Personal') || workspaces[0];
    const projects = await this.projectRepository.findByWorkspaceId(personalWorkspace.id);

    // Return the first project if any, or null (user needs to create via /project/new)
    return projects[0] || null;
  }
}