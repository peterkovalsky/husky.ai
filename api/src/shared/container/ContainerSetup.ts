import { DIContainer } from './DIContainer';

// Domain Repositories
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';

// Domain Services
import { IAIService } from '../../domain/services/IAIService';
import { IStorageService } from '../../domain/services/IStorageService';
import { IQueueService } from '../../domain/services/IQueueService';
import { IBuildService } from '../../domain/services/IBuildService';

// Infrastructure Implementations
import { SupabaseWorkspaceRepository } from '../../infrastructure/database/SupabaseWorkspaceRepository';
import { SupabaseProjectRepository } from '../../infrastructure/database/SupabaseProjectRepository';
import { SupabasePromptRepository } from '../../infrastructure/database/SupabasePromptRepository';
import { SupabaseBuildRepository } from '../../infrastructure/database/SupabaseBuildRepository';
import { AnthropicAIService } from '../../infrastructure/ai/AnthropicAIService';
import { S3StorageService } from '../../infrastructure/storage/S3StorageService';
import { SQSQueueService } from '../../infrastructure/queue/SQSQueueService';
import { BuildService } from '../../infrastructure/build/BuildService';
import { SupabaseAuthService } from '../../infrastructure/auth/SupabaseAuthService';

// Application Use Cases
import { CreatePromptUseCase } from '../../application/use-cases/CreatePromptUseCase';
import { GetPromptStatusUseCase } from '../../application/use-cases/GetPromptStatusUseCase';
import { CreateProjectUseCase } from '../../application/use-cases/CreateProjectUseCase';
import { GetProjectDetailsUseCase } from '../../application/use-cases/GetProjectDetailsUseCase';
import { ProcessJobUseCase } from '../../application/use-cases/ProcessJobUseCase';
import { DeleteProjectUseCase } from '../../application/use-cases/DeleteProjectUseCase';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';

// Presentation Layer
import { AuthMiddleware } from '../../presentation/middleware/AuthMiddleware';
import { WorkspaceAccessMiddleware } from '../../presentation/middleware/WorkspaceAccessMiddleware';
import { PromptController } from '../../presentation/controllers/PromptController';
import { ProjectController } from '../../presentation/controllers/ProjectController';
import { WorkspaceController } from '../../presentation/controllers/WorkspaceController';
import { UserController } from '../../presentation/controllers/UserController';

export function setupContainer(): DIContainer {
  const container = new DIContainer();

  // Register Repositories
  container.registerFactory<IWorkspaceRepository>('workspaceRepository', () => new SupabaseWorkspaceRepository());
  container.registerFactory<IProjectRepository>('projectRepository', () => new SupabaseProjectRepository());
  container.registerFactory<IPromptRepository>('promptRepository', () => new SupabasePromptRepository());
  container.registerFactory<IBuildRepository>('buildRepository', () => new SupabaseBuildRepository());

  // Register Infrastructure Services
  container.registerFactory<IAIService>('aiService', () => {
    const buildRepository = container.get<IBuildRepository>('buildRepository');
    return new AnthropicAIService(undefined, buildRepository);
  });
  
  container.registerFactory<IStorageService>('storageService', () => new S3StorageService());
  container.registerFactory<IQueueService>('queueService', () => new SQSQueueService());
  
  container.registerFactory<IBuildService>('buildService', () => {
    const buildRepository = container.get<IBuildRepository>('buildRepository');
    return new BuildService(buildRepository);
  });
  container.registerFactory<SupabaseAuthService>('authService', () => new SupabaseAuthService());

  // Register Use Cases
  container.registerFactory<CreatePromptUseCase>('createPromptUseCase', () => new CreatePromptUseCase(
    container.get<IPromptRepository>('promptRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<GetPromptStatusUseCase>('getPromptStatusUseCase', () => new GetPromptStatusUseCase(
    container.get<IPromptRepository>('promptRepository'),
    container.get<IProjectRepository>('projectRepository')
  ));

  container.registerFactory<CreateProjectUseCase>('createProjectUseCase', () => new CreateProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository')
  ));

  container.registerFactory<GetProjectDetailsUseCase>('getProjectDetailsUseCase', () => new GetProjectDetailsUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IPromptRepository>('promptRepository'),
    container.get<IBuildRepository>('buildRepository')
  ));

  container.registerFactory<ProcessJobUseCase>('processJobUseCase', () => new ProcessJobUseCase(
    container.get<IPromptRepository>('promptRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IAIService>('aiService'),
    container.get<IBuildService>('buildService'),
    container.get<IStorageService>('storageService')
  ));

  container.registerFactory<DeleteProjectUseCase>('deleteProjectUseCase', () => new DeleteProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IPromptRepository>('promptRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IStorageService>('storageService')
  ));

  container.registerFactory<SetupUserUseCase>('setupUserUseCase', () => new SetupUserUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IProjectRepository>('projectRepository')
  ));

  // Register Middleware
  container.registerFactory<AuthMiddleware>('authMiddleware', () => new AuthMiddleware(
    container.get<SupabaseAuthService>('authService')
  ));

  container.registerFactory<WorkspaceAccessMiddleware>('workspaceAccessMiddleware', () => new WorkspaceAccessMiddleware(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IPromptRepository>('promptRepository')
  ));

  // Register Controllers
  container.registerFactory<PromptController>('promptController', () => new PromptController(
    container.get<CreatePromptUseCase>('createPromptUseCase'),
    container.get<GetPromptStatusUseCase>('getPromptStatusUseCase')
  ));

  container.registerFactory<ProjectController>('projectController', () => new ProjectController(
    container.get<CreateProjectUseCase>('createProjectUseCase'),
    container.get<GetProjectDetailsUseCase>('getProjectDetailsUseCase'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IPromptRepository>('promptRepository'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<WorkspaceController>('workspaceController', () => new WorkspaceController(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<SetupUserUseCase>('setupUserUseCase')
  ));

  container.registerFactory<UserController>('userController', () => new UserController(
    container.get<SetupUserUseCase>('setupUserUseCase')
  ));

  return container;
}