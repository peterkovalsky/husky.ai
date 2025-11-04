import { DIContainer } from './DIContainer';
import { loadAppConfig } from '../config/AppConfig';
import { initializePostHogErrorTracker, IPostHogErrorTracker } from '../../infrastructure/monitoring/PostHogErrorTracker';
import { ILogger, ConsoleLogger } from '../logger/Logger';

// Domain Repositories
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';

// Domain Services
import { IAIService } from '../../domain/services/IAIService';
import { IStorageService } from '../../domain/services/IStorageService';
import { IQueueService } from '../../domain/services/IQueueService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IProjectEnvironmentService } from '../../domain/services/IProjectEnvironmentService';
import { ISubdomainService } from '../../domain/services/ISubdomainService';
import { ICloudFrontService } from '../../domain/services/ICloudFrontService';
import { IRoute53Service } from '../../domain/services/IRoute53Service';

// Infrastructure Implementations
import { SupabaseWorkspaceRepository } from '../../infrastructure/database/SupabaseWorkspaceRepository';
import { SupabaseProjectRepository } from '../../infrastructure/database/SupabaseProjectRepository';
import { SupabasePromptRepository } from '../../infrastructure/database/SupabasePromptRepository';
import { SupabaseBuildRepository } from '../../infrastructure/database/SupabaseBuildRepository';
import { SupabaseMediaRepository } from '../../infrastructure/database/SupabaseMediaRepository';
import { AnthropicAIService } from '../../infrastructure/ai/AnthropicAIService';
import { S3StorageService } from '../../infrastructure/storage/S3StorageService';
import { SQSQueueService } from '../../infrastructure/queue/SQSQueueService';
import { BuildService } from '../../infrastructure/build/BuildService';
import { ProjectEnvironmentService } from '../../infrastructure/build/ProjectEnvironmentService';
import { SupabaseAuthService } from '../../infrastructure/auth/SupabaseAuthService';
import { SubdomainService } from '../../infrastructure/subdomain/SubdomainService';
import { CloudFrontService } from '../../infrastructure/cdn/CloudFrontService';
import { Route53Service } from '../../infrastructure/dns/Route53Service';
import { R2PublishedAppsService } from '../../infrastructure/storage/R2PublishedAppsService';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';
import { DNSVerificationService, IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';

// Application Use Cases
import { CreatePromptUseCase } from '../../application/use-cases/CreatePromptUseCase';
import { GetPromptStatusUseCase } from '../../application/use-cases/GetPromptStatusUseCase';
import { CreateProjectUseCase } from '../../application/use-cases/CreateProjectUseCase';
import { GetProjectDetailsUseCase } from '../../application/use-cases/GetProjectDetailsUseCase';
import { ProcessJobUseCase } from '../../application/use-cases/ProcessJobUseCase';
import { PrepareProjectEnvironmentUseCase } from '../../application/use-cases/PrepareProjectEnvironmentUseCase';
import { DeleteProjectUseCase } from '../../application/use-cases/DeleteProjectUseCase';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';
import { GeneratePresignedUploadUseCase } from '../../application/use-cases/GeneratePresignedUploadUseCase';
import { ConfirmMediaUploadUseCase } from '../../application/use-cases/ConfirmMediaUploadUseCase';
import { DeleteMediaUseCase } from '../../application/use-cases/DeleteMediaUseCase';
import { ProcessMediaDeletionUseCase } from '../../application/use-cases/ProcessMediaDeletionUseCase';
import { InitiatePublishingUseCase } from '../../application/use-cases/InitiatePublishingUseCase';
import { InitiateUnpublishingUseCase } from '../../application/use-cases/InitiateUnpublishingUseCase';
import { GetPublishStatusUseCase } from '../../application/use-cases/GetPublishStatusUseCase';
import { ProcessPublishJobUseCase } from '../../application/use-cases/ProcessPublishJobUseCase';
import { ProcessUnpublishJobUseCase } from '../../application/use-cases/ProcessUnpublishJobUseCase';
import { ProvisionHostnameUseCase } from '../../application/use-cases/ProvisionHostnameUseCase';
import { SetCustomDomainUseCase } from '../../application/use-cases/SetCustomDomainUseCase';
import { VerifyCustomDomainDNSUseCase } from '../../application/use-cases/VerifyCustomDomainDNSUseCase';
import { RemoveCustomDomainUseCase } from '../../application/use-cases/RemoveCustomDomainUseCase';

// Presentation Layer
import { AuthMiddleware } from '../../presentation/middleware/AuthMiddleware';
import { WorkspaceAccessMiddleware } from '../../presentation/middleware/WorkspaceAccessMiddleware';
import { PromptController } from '../../presentation/controllers/PromptController';
import { ProjectController } from '../../presentation/controllers/ProjectController';
import { WorkspaceController } from '../../presentation/controllers/WorkspaceController';
import { UserController } from '../../presentation/controllers/UserController';
import { MediaController } from '../../presentation/controllers/MediaController';
import { PublishingController } from '../../presentation/controllers/PublishingController';
import { CustomDomainController } from '../../presentation/controllers/CustomDomainController';

export function setupContainer(): DIContainer {
  const container = new DIContainer();

  // Load configuration
  const config = loadAppConfig();

  // Initialize PostHog Error Tracker
  const postHogErrorTracker = initializePostHogErrorTracker(
    config.postHog.apiKey,
    config.postHog.host
  );
  container.register<IPostHogErrorTracker>('postHogErrorTracker', postHogErrorTracker);

  // Register Logger with PostHog integration
  container.registerFactory<ILogger>('logger', () => new ConsoleLogger(
    container.get<IPostHogErrorTracker>('postHogErrorTracker')
  ));

  // Register Repositories
  container.registerFactory<IWorkspaceRepository>('workspaceRepository', () => new SupabaseWorkspaceRepository());
  container.registerFactory<IProjectRepository>('projectRepository', () => new SupabaseProjectRepository());
  container.registerFactory<IPromptRepository>('promptRepository', () => new SupabasePromptRepository());
  container.registerFactory<IBuildRepository>('buildRepository', () => new SupabaseBuildRepository());
  container.registerFactory<IMediaRepository>('mediaRepository', () => new SupabaseMediaRepository());

  // Register Infrastructure Services
  container.registerFactory<IAIService>('aiService', () => {
    const promptRepository = container.get<IPromptRepository>('promptRepository');
    return new AnthropicAIService(promptRepository);
  });
  
  container.registerFactory<IStorageService>('storageService', () => new S3StorageService());
  container.registerFactory<IQueueService>('queueService', () => new SQSQueueService());
  
  container.registerFactory<IBuildService>('buildService', () => {
    const buildRepository = container.get<IBuildRepository>('buildRepository');
    return new BuildService(buildRepository);
  });

  container.registerFactory<IProjectEnvironmentService>('projectEnvironmentService', () => new ProjectEnvironmentService());

  container.registerFactory<SupabaseAuthService>('authService', () => new SupabaseAuthService());

  container.registerFactory<ISubdomainService>('subdomainService', () => new SubdomainService());

  // Cloudflare services for publishing
  container.registerFactory<R2PublishedAppsService>('r2PublishedAppsService', () => new R2PublishedAppsService());
  container.registerFactory<CloudflareSaaSService>('cloudflareSaaSService', () => new CloudflareSaaSService());
  container.registerFactory<CloudflareKVService>('cloudflareKVService', () => new CloudflareKVService());
  container.registerFactory<IDNSVerificationService>('dnsVerificationService', () => new DNSVerificationService());

  // Keep AWS services for backward compatibility (not used for new publishes)
  container.registerFactory<ICloudFrontService>('cloudFrontService', () => new CloudFrontService());
  container.registerFactory<IRoute53Service>('route53Service', () => new Route53Service());

  // Register Use Cases
  container.registerFactory<CreatePromptUseCase>('createPromptUseCase', () => new CreatePromptUseCase(
    container.get<IPromptRepository>('promptRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IQueueService>('queueService'),
    container.get<IMediaRepository>('mediaRepository')
  ));

  container.registerFactory<GetPromptStatusUseCase>('getPromptStatusUseCase', () => new GetPromptStatusUseCase(
    container.get<IPromptRepository>('promptRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IBuildRepository>('buildRepository')
  ));

  container.registerFactory<CreateProjectUseCase>('createProjectUseCase', () => new CreateProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<ISubdomainService>('subdomainService'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<GetProjectDetailsUseCase>('getProjectDetailsUseCase', () => new GetProjectDetailsUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IPromptRepository>('promptRepository'),
    container.get<IBuildRepository>('buildRepository')
  ));

  container.registerFactory<PrepareProjectEnvironmentUseCase>('prepareProjectEnvironmentUseCase', () => new PrepareProjectEnvironmentUseCase(
    container.get<IProjectEnvironmentService>('projectEnvironmentService')
  ));

  container.registerFactory<ProcessJobUseCase>('processJobUseCase', () => new ProcessJobUseCase(
    container.get<IPromptRepository>('promptRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IAIService>('aiService'),
    container.get<IBuildService>('buildService'),
    container.get<IStorageService>('storageService'),
    container.get<PrepareProjectEnvironmentUseCase>('prepareProjectEnvironmentUseCase'),
    container.get<IMediaRepository>('mediaRepository')
  ));

  container.registerFactory<DeleteProjectUseCase>('deleteProjectUseCase', () => new DeleteProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IPromptRepository>('promptRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IStorageService>('storageService'),
    container.get<R2PublishedAppsService>('r2PublishedAppsService'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService')
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

  // Register Media Use Cases
  container.registerFactory<GeneratePresignedUploadUseCase>('generatePresignedUploadUseCase', () => new GeneratePresignedUploadUseCase(
    container.get<IMediaRepository>('mediaRepository'),
    container.get<IStorageService>('storageService'),
    container.get<IProjectRepository>('projectRepository')
  ));

  container.registerFactory<ConfirmMediaUploadUseCase>('confirmMediaUploadUseCase', () => new ConfirmMediaUploadUseCase(
    container.get<IMediaRepository>('mediaRepository'),
    container.get<IStorageService>('storageService')
  ));

  container.registerFactory<DeleteMediaUseCase>('deleteMediaUseCase', () => new DeleteMediaUseCase(
    container.get<IMediaRepository>('mediaRepository'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<ProcessMediaDeletionUseCase>('processMediaDeletionUseCase', () => {
    return new ProcessMediaDeletionUseCase(
      container.get<IMediaRepository>('mediaRepository'),
      container.get<IBuildRepository>('buildRepository'),
      container.get<IStorageService>('storageService'),
      container.get<ILogger>('logger')
    );
  });

  // Register Media Controller
  container.registerFactory<MediaController>('mediaController', () => new MediaController(
    container.get<GeneratePresignedUploadUseCase>('generatePresignedUploadUseCase'),
    container.get<ConfirmMediaUploadUseCase>('confirmMediaUploadUseCase'),
    container.get<DeleteMediaUseCase>('deleteMediaUseCase')
  ));

  // Register Publishing Use Cases
  container.registerFactory<InitiatePublishingUseCase>('initiatePublishingUseCase', () => new InitiatePublishingUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<InitiateUnpublishingUseCase>('initiateUnpublishingUseCase', () => new InitiateUnpublishingUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<GetPublishStatusUseCase>('getPublishStatusUseCase', () => new GetPublishStatusUseCase(
    container.get<IProjectRepository>('projectRepository')
  ));

  container.registerFactory<ProcessPublishJobUseCase>('processPublishJobUseCase', () => new ProcessPublishJobUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<R2PublishedAppsService>('r2PublishedAppsService'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService'),
    container.get<IDNSVerificationService>('dnsVerificationService')
  ));

  container.registerFactory<ProcessUnpublishJobUseCase>('processUnpublishJobUseCase', () => new ProcessUnpublishJobUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<R2PublishedAppsService>('r2PublishedAppsService'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService')
  ));

  container.registerFactory<ProvisionHostnameUseCase>('provisionHostnameUseCase', () => new ProvisionHostnameUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService')
  ));

  // Register Custom Domain Use Cases
  container.registerFactory<SetCustomDomainUseCase>('setCustomDomainUseCase', () => new SetCustomDomainUseCase(
    container.get<IProjectRepository>('projectRepository')
  ));

  container.registerFactory<VerifyCustomDomainDNSUseCase>('verifyCustomDomainDNSUseCase', () => new VerifyCustomDomainDNSUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IDNSVerificationService>('dnsVerificationService')
  ));

  container.registerFactory<RemoveCustomDomainUseCase>('removeCustomDomainUseCase', () => new RemoveCustomDomainUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService')
  ));

  // Register Publishing Controller
  container.registerFactory<PublishingController>('publishingController', () => new PublishingController(
    container.get<InitiatePublishingUseCase>('initiatePublishingUseCase'),
    container.get<InitiateUnpublishingUseCase>('initiateUnpublishingUseCase'),
    container.get<GetPublishStatusUseCase>('getPublishStatusUseCase')
  ));

  // Register Custom Domain Controller
  container.registerFactory<CustomDomainController>('customDomainController', () => new CustomDomainController(
    container.get<SetCustomDomainUseCase>('setCustomDomainUseCase'),
    container.get<VerifyCustomDomainDNSUseCase>('verifyCustomDomainDNSUseCase'),
    container.get<RemoveCustomDomainUseCase>('removeCustomDomainUseCase')
  ));

  return container;
}