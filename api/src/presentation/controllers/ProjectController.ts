import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { CreateProjectUseCase } from '../../application/use-cases/CreateProjectUseCase';
import { CreateProjectFromPromptUseCase } from '../../application/use-cases/CreateProjectFromPromptUseCase';
import { GetProjectDetailsUseCase } from '../../application/use-cases/GetProjectDetailsUseCase';
import { GetChatMessagesUseCase } from '../../application/use-cases/GetChatMessagesUseCase';
import { UpdateProjectUseCase } from '../../application/use-cases/UpdateProjectUseCase';
import { UndoVersionUseCase } from '../../application/use-cases/UndoVersionUseCase';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IQueueService, DeleteProjectMessage } from '../../domain/services/IQueueService';
import { IStorageService } from '../../domain/services/IStorageService';
import { Project } from '../../domain/entities/Project';

export class ProjectController {
  constructor(
    private createProjectUseCase: CreateProjectUseCase,
    private createProjectFromPromptUseCase: CreateProjectFromPromptUseCase,
    private getProjectDetailsUseCase: GetProjectDetailsUseCase,
    private getChatMessagesUseCase: GetChatMessagesUseCase,
    private updateProjectUseCase: UpdateProjectUseCase,
    private undoVersionUseCase: UndoVersionUseCase,
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository,
    private queueService: IQueueService,
    private storageService: IStorageService
  ) {}

  /**
   * Construct thumbnail URLs for a list of projects from projectId and currentVersion
   * The thumbnail key is derived: {projectId}/thumbnails/v{currentVersion}.png
   * If the file doesn't exist in S3, thumbnailUrl will be null (frontend shows placeholder)
   */
  private async addThumbnailUrls(projects: Project[]): Promise<Project[]> {
    return Promise.all(
      projects.map(async (project) => {
        // Only generate thumbnail URL for projects with at least one successful build
        if (project.currentVersion && project.currentVersion > 0) {
          try {
            // Construct storage key from projectId and currentVersion
            const storageKey = `${project.id}/thumbnails/v${project.currentVersion}.png`;

            // Check if the thumbnail exists in R2/storage
            const projectsBucket = process.env.CLOUDFLARE_R2_PROJECTS_BUCKET || process.env.S3_PROJECTS_BUCKET_NAME;
            const exists = await this.storageService.verifyFileExists(storageKey, projectsBucket);
            if (!exists) {
              console.log(`[ProjectController] Thumbnail not found for project ${project.id} version ${project.currentVersion}`);
              return { ...project, thumbnailUrl: null };
            }

            const presignedUrl = await this.storageService.getThumbnailPresignedUrl(
              storageKey,
              3600 // 1 hour expiry
            );
            return { ...project, thumbnailUrl: presignedUrl };
          } catch (error) {
            console.warn(`[ProjectController] Failed to generate presigned URL for thumbnail: ${error}`);
            return { ...project, thumbnailUrl: null };
          }
        }
        return { ...project, thumbnailUrl: null };
      })
    );
  }

  createProject = async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, workspaceId } = req.body;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const project = await this.createProjectUseCase.execute(
        { name, description, workspaceId },
        req.user
      );

      console.log(`Created project ${project.id} for user ${req.user.id}`);
      res.status(201).json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to create project',
        details: errorMessage
      });
    }
  };

  createProjectFromPrompt = async (req: AuthRequest, res: Response) => {
    try {
      const { suggestedName, workspaceId } = req.body;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!suggestedName || typeof suggestedName !== 'string' || !suggestedName.trim()) {
        return res.status(400).json({ error: 'suggestedName is required' });
      }

      const project = await this.createProjectFromPromptUseCase.execute(
        { suggestedName, workspaceId },
        req.user
      );

      console.log(`Created project from prompt "${project.name}" (${project.id}) for user ${req.user.id}`);
      res.status(201).json(project);
    } catch (error) {
      console.error('Error creating project from prompt:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to create project',
        details: errorMessage
      });
    }
  };

  updateProject = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const { name, description } = req.body;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`PATCH /api/projects/${projectId} - User: ${req.user.id}, Name: ${name}`);

      const project = await this.updateProjectUseCase.execute(
        projectId,
        { name, description },
        req.user
      );

      console.log(`Updated project ${project.id} for user ${req.user.id}`);
      res.json(project);
    } catch (error) {
      console.error('Error updating project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle specific error types
      if (errorMessage === 'Project not found') {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('required') || errorMessage.includes('characters')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to update project',
        details: errorMessage
      });
    }
  };

  getProjectDetails = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`GET /api/project/${projectId} - User: ${req.user.id}, ProjectId: ${projectId}`);
      
      const result = await this.getProjectDetailsUseCase.execute(projectId, req.user);
      res.json(result);
    } catch (error) {
      console.error('Error fetching project details:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'Project not found') {
        return res.status(404).json({ error: errorMessage });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch project details',
        details: errorMessage
      });
    }
  };

  getChatMessages = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);
      const before = req.query.before as string | undefined;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await this.getChatMessagesUseCase.execute(projectId, limit, before);
      res.json(result);
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to fetch chat messages',
        details: errorMessage
      });
    }
  };

  getProjectsByWorkspace = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId } = req.params;
      const projects = await this.projectRepository.findByWorkspaceId(workspaceId);

      // Add presigned URLs for thumbnails
      const projectsWithThumbnails = await this.addThumbnailUrls(projects);

      res.json({ projects: projectsWithThumbnails });
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  };

  getPromptsByProject = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      // Builds now contain user prompts (builds are the source of truth)
      const builds = await this.buildRepository.findByProjectId(projectId);
      // Map builds to prompt-like objects for API compatibility
      const prompts = builds.map(build => ({
        id: build.id,
        prompt: build.userPrompt,
        projectId: build.projectId,
        status: build.status,
        createdAt: build.createdAt,
        modifiedAt: build.modifiedAt
      }));
      res.json({ prompts });
    } catch (error) {
      console.error('Error fetching prompts:', error);
      res.status(500).json({ error: 'Failed to fetch prompts' });
    }
  };

  deleteProject = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get project to verify it exists and user has access
      const project = await this.projectRepository.findByIdForOperations(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check user access
      const hasAccess = await this.projectRepository.checkUserAccess(req.user.id, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if project is already being deleted
      if (project.status === 'DELETING') {
        return res.status(409).json({ error: 'Project is already being deleted' });
      }

      // Update project status to DELETING
      await this.projectRepository.updateStatus(projectId, 'DELETING');

      // Send message to queue for background deletion
      const deleteMessage: DeleteProjectMessage = {
        action: 'DELETE_PROJECT',
        projectId,
        userId: req.user.id,
        timestamp: new Date().toISOString()
      };

      await this.queueService.sendMessage(deleteMessage);

      console.log(`Project ${projectId} marked for deletion by user ${req.user.id}`);
      res.json({ message: 'Project deletion initiated', projectId });
    } catch (error) {
      console.error('Error deleting project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to delete project',
        details: errorMessage
      });
    }
  };

  undoVersion = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`POST /api/projects/${projectId}/undo-version - User: ${req.user.id}`);

      const result = await this.undoVersionUseCase.execute(projectId);

      console.log(`Successfully undid version for project ${projectId}, restored to version ${result.version}`);
      res.json({
        success: true,
        version: result.version,
        previewUrl: result.previewUrl
      });
    } catch (error) {
      console.error('Error undoing version:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Return specific status codes for different error types
      if (errorMessage === 'Project not found') {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('At least 2 successful builds required')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to undo version',
        details: errorMessage
      });
    }
  };
}