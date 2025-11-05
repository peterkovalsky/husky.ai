import { Router } from 'express';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import { WorkspaceAccessMiddleware } from '../middleware/WorkspaceAccessMiddleware';
import { PromptController } from '../controllers/PromptController';
import { ProjectController } from '../controllers/ProjectController';
import { WorkspaceController } from '../controllers/WorkspaceController';
import { UserController } from '../controllers/UserController';
import { MediaController } from '../controllers/MediaController';
import { PublishingController } from '../controllers/PublishingController';
import { CustomDomainController } from '../controllers/CustomDomainController';

interface ApiRoutesDependencies {
  authMiddleware: AuthMiddleware;
  workspaceAccessMiddleware: WorkspaceAccessMiddleware;
  promptController: PromptController;
  projectController: ProjectController;
  workspaceController: WorkspaceController;
  userController: UserController;
  mediaController: MediaController;
  publishingController: PublishingController;
  customDomainController: CustomDomainController;
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

  router.post('/projects/:projectId/undo-version',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.projectController.undoVersion
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

  // Custom domain routes
  router.put('/projects/:projectId/custom-domain',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.customDomainController.setCustomDomain
  );

  router.post('/projects/:projectId/custom-domain/verify',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.customDomainController.verifyDNS
  );

  router.delete('/projects/:projectId/custom-domain',
    deps.authMiddleware.authenticate,
    deps.workspaceAccessMiddleware.checkProjectAccess('projectId'),
    deps.customDomainController.removeCustomDomain
  );

  // Test error routes (DEVELOPMENT ONLY)
  if (process.env.NODE_ENV !== 'production') {
    const { TestErrorController } = require('../controllers/TestErrorController');
    const testErrorController = new TestErrorController();

    console.log('[API Routes] Test error endpoints enabled (development mode)');

    // Test different error types
    router.get('/test/error/validation', testErrorController.testValidationError);
    router.get('/test/error/auth', testErrorController.testAuthError);
    router.get('/test/error/authorization', testErrorController.testAuthorizationError);
    router.get('/test/error/not-found', testErrorController.testNotFoundError);
    router.get('/test/error/conflict', testErrorController.testConflictError);
    router.get('/test/error/database', testErrorController.testDatabaseError);
    router.get('/test/error/queue', testErrorController.testQueueError);
    router.get('/test/error/build', testErrorController.testBuildError);
    router.get('/test/error/external-service', testErrorController.testExternalServiceError);
    router.get('/test/error/generic', testErrorController.testGenericError);
    router.get('/test/error/async', testErrorController.testAsyncError);
    router.get('/test/success', testErrorController.testSuccess);
  }

  return router;
}