import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { CreateProjectUseCase } from '../../application/use-cases/CreateProjectUseCase';
import { GetProjectDetailsUseCase } from '../../application/use-cases/GetProjectDetailsUseCase';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';

export class ProjectController {
  constructor(
    private createProjectUseCase: CreateProjectUseCase,
    private getProjectDetailsUseCase: GetProjectDetailsUseCase,
    private projectRepository: IProjectRepository,
    private promptRepository: IPromptRepository
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
}