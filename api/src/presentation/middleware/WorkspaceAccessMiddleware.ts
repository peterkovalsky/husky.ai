import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';

export class WorkspaceAccessMiddleware {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private projectRepository: IProjectRepository,
    private promptRepository: IPromptRepository
  ) {}

  checkWorkspaceAccess = (paramName: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const workspaceId = req.params[paramName];
        const userId = req.user?.id;

        if (!userId || !workspaceId) {
          return res.status(400).json({ error: 'Missing user or workspace information' });
        }

        const hasAccess = await this.workspaceRepository.checkUserAccess(userId, workspaceId);
        
        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to workspace' });
        }

        next();
      } catch (error) {
        console.error('Workspace access check error:', error);
        return res.status(500).json({ error: 'Internal server error during access check' });
      }
    };
  };

  checkProjectAccess = (paramName: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const projectId = req.params[paramName];
        const userId = req.user?.id;

        if (!userId || !projectId) {
          return res.status(400).json({ error: 'Missing user or project information' });
        }

        const hasAccess = await this.projectRepository.checkUserAccess(userId, projectId);
        
        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to project' });
        }

        next();
      } catch (error) {
        console.error('Project access check error:', error);
        return res.status(500).json({ error: 'Internal server error during access check' });
      }
    };
  };

  checkPromptAccess = (paramName: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const promptId = req.params[paramName];
        const userId = req.user?.id;

        if (!userId || !promptId) {
          return res.status(400).json({ error: 'Missing user or prompt information' });
        }

        // Get prompt to find its project
        const prompt = await this.promptRepository.findById(promptId);
        if (!prompt) {
          return res.status(404).json({ error: 'Prompt not found' });
        }

        // Check if user has access to the project
        const hasAccess = await this.projectRepository.checkUserAccess(userId, prompt.projectId);
        
        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to prompt' });
        }

        next();
      } catch (error) {
        console.error('Prompt access check error:', error);
        return res.status(500).json({ error: 'Internal server error during access check' });
      }
    };
  };
}