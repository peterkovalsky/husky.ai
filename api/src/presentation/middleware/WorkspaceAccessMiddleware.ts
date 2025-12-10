import { Response, NextFunction } from 'express';
import { AuthRequest } from './AuthMiddleware';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { ValidationError, AuthorizationError, NotFoundError } from '../../shared/errors/AppErrors';

export class WorkspaceAccessMiddleware {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository
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
        const buildId = req.params[paramName];  // Now using buildId (same as promptId for compatibility)
        const userId = req.user?.id;

        if (!userId || !buildId) {
          throw new ValidationError('Missing user or prompt information');
        }

        // Get build to find its project (builds are now the source of truth)
        const build = await this.buildRepository.findById(buildId);
        if (!build) {
          throw new NotFoundError('Prompt not found', { promptId: buildId });
        }

        // Check if user has access to the project
        const hasAccess = await this.projectRepository.checkUserAccess(userId, build.projectId);

        if (!hasAccess) {
          throw new AuthorizationError('Access denied to prompt', {
            userId,
            promptId: buildId,
            projectId: build.projectId,
          });
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
}