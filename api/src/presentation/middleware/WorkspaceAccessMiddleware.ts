import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { ValidationError, AuthorizationError, NotFoundError } from '../../shared/errors/AppErrors';

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
          throw new ValidationError('Missing user or workspace information');
        }

        const hasAccess = await this.workspaceRepository.checkUserAccess(userId, workspaceId);

        if (!hasAccess) {
          throw new AuthorizationError('Access denied to workspace', {
            userId,
            workspaceId,
          });
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  checkProjectAccess = (paramName: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const projectId = req.params[paramName];
        const userId = req.user?.id;

        if (!userId || !projectId) {
          throw new ValidationError('Missing user or project information');
        }

        const hasAccess = await this.projectRepository.checkUserAccess(userId, projectId);

        if (!hasAccess) {
          throw new AuthorizationError('Access denied to project', {
            userId,
            projectId,
          });
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  checkPromptAccess = (paramName: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const promptId = req.params[paramName];
        const userId = req.user?.id;

        if (!userId || !promptId) {
          throw new ValidationError('Missing user or prompt information');
        }

        // Get prompt to find its project
        const prompt = await this.promptRepository.findById(promptId);
        if (!prompt) {
          throw new NotFoundError('Prompt not found', { promptId });
        }

        // Check if user has access to the project
        const hasAccess = await this.projectRepository.checkUserAccess(userId, prompt.projectId);

        if (!hasAccess) {
          throw new AuthorizationError('Access denied to prompt', {
            userId,
            promptId,
            projectId: prompt.projectId,
          });
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
}