import { Router } from 'express';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import { WorkspaceAccessMiddleware } from '../middleware/WorkspaceAccessMiddleware';
import { PromptController } from '../controllers/PromptController';
import { ProjectController } from '../controllers/ProjectController';
import { WorkspaceController } from '../controllers/WorkspaceController';
import { UserController } from '../controllers/UserController';
import { MediaController } from '../controllers/MediaController';
import { PublishingController } from '../controllers/PublishingController';
interface ApiRoutesDependencies {
  authMiddleware: AuthMiddleware;
  workspaceAccessMiddleware: WorkspaceAccessMiddleware;
  promptController: PromptController;
  projectController: ProjectController;
  workspaceController: WorkspaceController;
  userController: UserController;
  mediaController: MediaController;
  publishingController: PublishingController;
}

export function createApiRoutes(deps: ApiRoutesDependencies): Router {
  const router = Router();


  // Prompt routes
  router.post('/prompt', 
    deps.authMiddleware.authenticate, 
    deps.promptController.createPrompt
  );

  router.get('/status/:promptId', 
    deps.authMiddleware.authenticate, 
    deps.workspaceAccessMiddleware.checkPromptAccess('promptId'), 
    deps.promptController.getPromptStatus
  );

  // User routes

  router.get('/user/default-project', 
    deps.authMiddleware.authenticate, 
    deps.userController.getDefaultProject
  );

  // Workspace routes
  router.get('/workspaces', 
    deps.authMiddleware.authenticate, 
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

  // Media routes
  router.post('/media/presigned-upload',
    deps.authMiddleware.authenticate,
    deps.mediaController.generatePresignedUpload
  );

  router.post('/media/confirm-upload',
    deps.authMiddleware.authenticate,
    deps.mediaController.confirmUpload
  );

  router.delete('/media/:mediaId',
    deps.authMiddleware.authenticate,
    deps.mediaController.deleteMedia
  );

  // Publishing routes
  router.post('/projects/:projectId/publish',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.publishingController.publish
  );

  router.post('/projects/:projectId/unpublish',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.publishingController.unpublish
  );

  router.get('/projects/:projectId/publish/status',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.publishingController.getStatus
  );

  router.post('/projects/:projectId/publish/retry',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.publishingController.retry
  );

  return router;
}