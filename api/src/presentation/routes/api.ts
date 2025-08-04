import { Router } from 'express';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import { WorkspaceAccessMiddleware } from '../middleware/WorkspaceAccessMiddleware';
import { PromptController } from '../controllers/PromptController';
import { ProjectController } from '../controllers/ProjectController';
import { WorkspaceController } from '../controllers/WorkspaceController';
import { UserController } from '../controllers/UserController';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';

interface ApiRoutesDependencies {
  authMiddleware: AuthMiddleware;
  workspaceAccessMiddleware: WorkspaceAccessMiddleware;
  promptController: PromptController;
  projectController: ProjectController;
  workspaceController: WorkspaceController;
  userController: UserController;
  setupUserUseCase: SetupUserUseCase;
}

export function createApiRoutes(deps: ApiRoutesDependencies): Router {
  const router = Router();

  // Enhanced auth middleware that ensures user setup on first login
  const ensureUserSetup = async (req: any, res: any, next: any) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Check if user has workspaces, if not set them up
      const defaultProject = await deps.setupUserUseCase.getUserDefaultProject(req.user.id);
      
      if (!defaultProject) {
        console.log(`Setting up new user on first login: ${req.user.id}`);
        await deps.setupUserUseCase.execute(req.user.id, req.user.displayName || req.user.email);
      }

      next();
    } catch (error) {
      console.error('Error ensuring user setup:', error);
      return res.status(500).json({ error: 'Failed to setup user' });
    }
  };

  // Prompt routes
  router.post('/prompt', 
    deps.authMiddleware.authenticate, 
    ensureUserSetup, 
    deps.promptController.createPrompt
  );

  router.get('/status/:promptId', 
    deps.authMiddleware.authenticate, 
    deps.workspaceAccessMiddleware.checkPromptAccess('promptId'), 
    deps.promptController.getPromptStatus
  );

  // User routes
  router.post('/user/setup', 
    deps.authMiddleware.authenticate, 
    deps.userController.setupUser
  );

  // Workspace routes
  router.get('/workspaces', 
    deps.authMiddleware.authenticate, 
    ensureUserSetup, 
    deps.workspaceController.getWorkspaces
  );

  // Project routes
  router.get('/projects/:workspaceId', 
    deps.authMiddleware.authenticate, 
    deps.workspaceAccessMiddleware.checkWorkspaceAccess('workspaceId'), 
    deps.projectController.getProjectsByWorkspace
  );

  router.post('/projects', 
    deps.authMiddleware.authenticate, 
    ensureUserSetup, 
    deps.projectController.createProject
  );

  router.get('/project/:projectId', 
    deps.authMiddleware.authenticate, 
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'), 
    deps.projectController.getProjectDetails
  );

  router.get('/prompts/:projectId', 
    deps.authMiddleware.authenticate, 
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'), 
    deps.projectController.getPromptsByProject
  );

  router.delete('/projects/:projectId', 
    deps.authMiddleware.authenticate, 
    deps.projectController.deleteProject
  );

  return router;
}