import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { DatabaseService } from '../services/DatabaseService';

export class WorkspaceAccessMiddleware {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = new DatabaseService();
  }

  // Middleware to check if user has access to a workspace
  checkWorkspaceAccess = (workspaceIdParam: string = 'workspaceId') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'User not authenticated' });
        }

        const workspaceId = req.params[workspaceIdParam] || req.body.workspace_id;
        
        if (!workspaceId) {
          return res.status(400).json({ error: 'Workspace ID is required' });
        }

        const hasAccess = await this.dbService.checkUserWorkspaceAccess(req.user.id, workspaceId);
        
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

  // Middleware to check if user has access to a project
  checkProjectAccess = (projectIdParam: string = 'projectId') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'User not authenticated' });
        }

        const projectId = req.params[projectIdParam] || req.body.project_id;
        
        if (!projectId) {
          return res.status(400).json({ error: 'Project ID is required' });
        }

        const hasAccess = await this.dbService.checkUserProjectAccess(req.user.id, projectId);
        
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

  // Middleware to check if user has access to a prompt
  checkPromptAccess = (promptIdParam: string = 'promptId') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'User not authenticated' });
        }

        const promptId = req.params[promptIdParam] || req.body.prompt_id;
        
        if (!promptId) {
          return res.status(400).json({ error: 'Prompt ID is required' });
        }

        const prompt = await this.dbService.getPromptById(promptId);
        
        if (!prompt) {
          return res.status(404).json({ error: 'Prompt not found' });
        }

        const hasAccess = await this.dbService.checkUserProjectAccess(req.user.id, prompt.project_id);
        
        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to prompt' });
        }

        // Add prompt to request for use in handler
        (req as any).prompt = prompt;

        next();
      } catch (error) {
        console.error('Prompt access check error:', error);
        return res.status(500).json({ error: 'Internal server error during access check' });
      }
    };
  };
}

export const workspaceAccessMiddleware = new WorkspaceAccessMiddleware();