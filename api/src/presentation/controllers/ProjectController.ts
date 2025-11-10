import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { CreateProjectUseCase } from '../../application/use-cases/CreateProjectUseCase';
import { GetProjectDetailsUseCase } from '../../application/use-cases/GetProjectDetailsUseCase';
import { UpdateProjectUseCase } from '../../application/use-cases/UpdateProjectUseCase';
import { UndoVersionUseCase } from '../../application/use-cases/UndoVersionUseCase';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IQueueService, DeleteProjectMessage } from '../../domain/services/IQueueService';

export class ProjectController {
  constructor(
    private createProjectUseCase: CreateProjectUseCase,
    private getProjectDetailsUseCase: GetProjectDetailsUseCase,
    private updateProjectUseCase: UpdateProjectUseCase,
    private undoVersionUseCase: UndoVersionUseCase,
    private projectRepository: IProjectRepository,
    private promptRepository: IPromptRepository,
    private queueService: IQueueService
  ) {}

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

  getProjectsByWorkspace = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId } = req.params;
      const projects = await this.projectRepository.findByWorkspaceId(workspaceId);
      res.json({ projects });
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  };

  getPromptsByProject = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const prompts = await this.promptRepository.findByProjectId(projectId);
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