import { DIContainer } from './DIContainer';
import { loadAppConfig } from '../config/AppConfig';
import { initializePostHogErrorTracker, IPostHogErrorTracker } from '../../infrastructure/monitoring/PostHogErrorTracker';
import { ILogger, ConsoleLogger } from '../logger/Logger';

// Domain Repositories
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IInspoRepository } from '../../domain/repositories/IInspoRepository';
import { ICreditPurchaseRepository } from '../../domain/repositories/ICreditPurchaseRepository';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { IChatMessageRepository } from '../../domain/repositories/IChatMessageRepository';

// Domain Services
import { IAIService } from '../../domain/services/IAIService';
import { IAIProvider } from '../../domain/services/IAIProvider';
import { IStorageService } from '../../domain/services/IStorageService';
import { IPublicMediaStorageService } from '../../domain/services/IPublicMediaStorageService';
import { IQueueService } from '../../domain/services/IQueueService';
import { ISubdomainService } from '../../domain/services/ISubdomainService';
import { ICloudFrontService } from '../../domain/services/ICloudFrontService';
import { IRoute53Service } from '../../domain/services/IRoute53Service';
import { IStripeService } from '../../domain/services/IStripeService';

// Infrastructure Implementations
import { SupabaseWorkspaceRepository } from '../../infrastructure/database/SupabaseWorkspaceRepository';
import { SupabaseProjectRepository } from '../../infrastructure/database/SupabaseProjectRepository';
import { SupabaseBuildRepository } from '../../infrastructure/database/SupabaseBuildRepository';
import { SupabaseMediaRepository } from '../../infrastructure/database/SupabaseMediaRepository';
import { SupabaseInspoRepository } from '../../infrastructure/database/SupabaseInspoRepository';
import { SupabaseCreditPurchaseRepository } from '../../infrastructure/database/SupabaseCreditPurchaseRepository';
import { SupabaseAILogRepository } from '../../infrastructure/database/SupabaseAILogRepository';
import { SupabaseChatMessageRepository } from '../../infrastructure/database/SupabaseChatMessageRepository';
import { AnthropicProvider } from '../../infrastructure/ai/AnthropicProvider';
import { OpenAIProvider } from '../../infrastructure/ai/OpenAIProvider';
import { GeminiProvider } from '../../infrastructure/ai/GeminiProvider';
import { AIService } from '../../infrastructure/ai/AIService';
import { R2StorageService } from '../../infrastructure/storage/R2StorageService';
import { SQSQueueService } from '../../infrastructure/queue/SQSQueueService';
import { CloudTasksQueueService } from '../../infrastructure/queue/CloudTasksQueueService';
import { SupabaseAuthService } from '../../infrastructure/auth/SupabaseAuthService';
import { SubdomainService } from '../../infrastructure/subdomain/SubdomainService';
import { CloudFrontService } from '../../infrastructure/cdn/CloudFrontService';
import { Route53Service } from '../../infrastructure/dns/Route53Service';
import { R2PublishedAppsService } from '../../infrastructure/storage/R2PublishedAppsService';
import { R2PublicMediaService } from '../../infrastructure/storage/R2PublicMediaService';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';
import { DNSVerificationService, IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';
import { StripeService } from '../../infrastructure/payment/StripeService';

// Application Use Cases
import { CreatePromptUseCase } from '../../application/use-cases/CreatePromptUseCase';
import { GetPromptStatusUseCase } from '../../application/use-cases/GetPromptStatusUseCase';
import { AnalyzePromptUseCase } from '../../application/use-cases/AnalyzePromptUseCase';
import { CreateProjectUseCase } from '../../application/use-cases/CreateProjectUseCase';
import { CreateProjectFromPromptUseCase } from '../../application/use-cases/CreateProjectFromPromptUseCase';
import { GetProjectDetailsUseCase } from '../../application/use-cases/GetProjectDetailsUseCase';
import { UpdateProjectUseCase } from '../../application/use-cases/UpdateProjectUseCase';
import { DeleteProjectUseCase } from '../../application/use-cases/DeleteProjectUseCase';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';
import { GeneratePresignedUploadUseCase } from '../../application/use-cases/GeneratePresignedUploadUseCase';
import { ConfirmMediaUploadUseCase } from '../../application/use-cases/ConfirmMediaUploadUseCase';
import { DeleteMediaUseCase } from '../../application/use-cases/DeleteMediaUseCase';
import { ProcessMediaDeletionUseCase } from '../../application/use-cases/ProcessMediaDeletionUseCase';
import { GetInspoGalleryUseCase } from '../../application/use-cases/GetInspoGalleryUseCase';
import { InitiatePublishingUseCase } from '../../application/use-cases/InitiatePublishingUseCase';
import { InitiateUnpublishingUseCase } from '../../application/use-cases/InitiateUnpublishingUseCase';
import { GetPublishStatusUseCase } from '../../application/use-cases/GetPublishStatusUseCase';
import { ProcessPublishJobUseCase } from '../../application/use-cases/ProcessPublishJobUseCase';
import { ProcessUnpublishJobUseCase } from '../../application/use-cases/ProcessUnpublishJobUseCase';
import { ProvisionHostnameUseCase } from '../../application/use-cases/ProvisionHostnameUseCase';
import { SetCustomDomainUseCase } from '../../application/use-cases/SetCustomDomainUseCase';
import { VerifyCustomDomainDNSUseCase } from '../../application/use-cases/VerifyCustomDomainDNSUseCase';
import { RemoveCustomDomainUseCase } from '../../application/use-cases/RemoveCustomDomainUseCase';
import { UndoVersionUseCase } from '../../application/use-cases/UndoVersionUseCase';

// Billing Use Cases
import { CheckWorkspaceCreditsUseCase } from '../../application/use-cases/billing/CheckWorkspaceCreditsUseCase';
import { ConsumeCreditsUseCase } from '../../application/use-cases/billing/ConsumeCreditsUseCase';
import { PurchaseCreditsUseCase } from '../../application/use-cases/billing/PurchaseCreditsUseCase';
import { UpgradeSubscriptionUseCase } from '../../application/use-cases/billing/UpgradeSubscriptionUseCase';
import { CancelSubscriptionUseCase } from '../../application/use-cases/billing/CancelSubscriptionUseCase';
import { ResetMonthlyCreditsUseCase } from '../../application/use-cases/billing/ResetMonthlyCreditsUseCase';

// Presentation Layer
import { AuthMiddleware } from '../../presentation/middleware/AuthMiddleware';
import { WorkspaceAccessMiddleware } from '../../presentation/middleware/WorkspaceAccessMiddleware';
import { PromptController } from '../../presentation/controllers/PromptController';
import { ProjectController } from '../../presentation/controllers/ProjectController';
import { WorkspaceController } from '../../presentation/controllers/WorkspaceController';
import { UserController } from '../../presentation/controllers/UserController';
import { MediaController } from '../../presentation/controllers/MediaController';
import { InspoController } from '../../presentation/controllers/InspoController';
import { PublishingController } from '../../presentation/controllers/PublishingController';
import { CustomDomainController } from '../../presentation/controllers/CustomDomainController';
import { BillingController } from '../../presentation/controllers/BillingController';
import { StripeWebhookController } from '../../presentation/controllers/StripeWebhookController';

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
  container.registerFactory<IBuildRepository>('buildRepository', () => new SupabaseBuildRepository());
  container.registerFactory<IMediaRepository>('mediaRepository', () => new SupabaseMediaRepository());
  container.registerFactory<IInspoRepository>('inspoRepository', () => new SupabaseInspoRepository());
  container.registerFactory<ICreditPurchaseRepository>('creditPurchaseRepository', () => new SupabaseCreditPurchaseRepository());
  container.registerFactory<IAILogRepository>('aiLogRepository', () => new SupabaseAILogRepository());
  container.registerFactory<IChatMessageRepository>('chatMessageRepository', () => new SupabaseChatMessageRepository());

  // Register AI Providers
  container.registerFactory<IAIProvider>('anthropicProvider', () => {
    const aiLogRepository = container.get<IAILogRepository>('aiLogRepository');
    return new AnthropicProvider(aiLogRepository, config.ai.anthropicApiKey);
  });

  container.registerFactory<IAIProvider>('openaiProvider', () => {
    const aiLogRepository = container.get<IAILogRepository>('aiLogRepository');
    return new OpenAIProvider(aiLogRepository, config.ai.openaiApiKey);
  });

  container.registerFactory<IAIProvider>('geminiProvider', () => {
    const aiLogRepository = container.get<IAILogRepository>('aiLogRepository');
    return new GeminiProvider(aiLogRepository, config.ai.geminiApiKey);
  });

  // Register AI Service (orchestrator with all providers)
  container.registerFactory<IAIService>('aiService', () => {
    const buildRepository = container.get<IBuildRepository>('buildRepository');
    const aiLogRepository = container.get<IAILogRepository>('aiLogRepository');

    // Collect all available providers
    const providers: IAIProvider[] = [];

    // Add Anthropic provider if API key is configured
    if (config.ai.anthropicApiKey) {
      providers.push(container.get<IAIProvider>('anthropicProvider'));
      console.log(`[Container] Registered Anthropic provider`);
    }

    // Add OpenAI provider if API key is configured
    if (config.ai.openaiApiKey) {
      providers.push(container.get<IAIProvider>('openaiProvider'));
      console.log(`[Container] Registered OpenAI provider`);
    }

    // Add Gemini provider if API key is configured
    if (config.ai.geminiApiKey) {
      providers.push(container.get<IAIProvider>('geminiProvider'));
      console.log(`[Container] Registered Gemini provider`);
    }

    if (providers.length === 0) {
      throw new Error('No AI providers configured. Please set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
    }

    console.log(`[Container] Primary model: ${config.ai.primary.model}`);
    console.log(`[Container] Fast model: ${config.ai.fast.model}`);

    return new AIService(providers, buildRepository, aiLogRepository);
  });
  
  container.registerFactory<IStorageService>('storageService', () => new R2StorageService());

  // Queue provider selection based on QUEUE_PROVIDER env var
  // Default to 'cloudtasks' for GCP Cloud Run deployment
  container.registerFactory<IQueueService>('queueService', () => {
    const queueProvider = process.env.QUEUE_PROVIDER || 'cloudtasks';
    if (queueProvider === 'sqs') {
      console.log('[Container] Using SQS queue provider');
      return new SQSQueueService();
    }
    console.log('[Container] Using Cloud Tasks queue provider');
    return new CloudTasksQueueService();
  });

  container.registerFactory<SupabaseAuthService>('authService', () => new SupabaseAuthService());

  container.registerFactory<ISubdomainService>('subdomainService', () => new SubdomainService());

  // Cloudflare services for publishing
  container.registerFactory<R2PublishedAppsService>('r2PublishedAppsService', () => new R2PublishedAppsService());
  container.registerFactory<IPublicMediaStorageService>('r2PublicMediaService', () => new R2PublicMediaService());
  container.registerFactory<CloudflareSaaSService>('cloudflareSaaSService', () => new CloudflareSaaSService());
  container.registerFactory<CloudflareKVService>('cloudflareKVService', () => new CloudflareKVService());
  container.registerFactory<IDNSVerificationService>('dnsVerificationService', () => new DNSVerificationService());

  // Keep AWS services for backward compatibility (not used for new publishes)
  container.registerFactory<ICloudFrontService>('cloudFrontService', () => new CloudFrontService());
  container.registerFactory<IRoute53Service>('route53Service', () => new Route53Service());

  // Stripe payment service
  container.registerFactory<IStripeService>('stripeService', () => new StripeService());

  // Register Use Cases
  container.registerFactory<CreatePromptUseCase>('createPromptUseCase', () => new CreatePromptUseCase(
    container.get<IBuildRepository>('buildRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IQueueService>('queueService'),
    container.get<IMediaRepository>('mediaRepository'),
    container.get<IChatMessageRepository>('chatMessageRepository')
  ));

  container.registerFactory<GetPromptStatusUseCase>('getPromptStatusUseCase', () => new GetPromptStatusUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IBuildRepository>('buildRepository')
  ));

  container.registerFactory<AnalyzePromptUseCase>('analyzePromptUseCase', () => new AnalyzePromptUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IAILogRepository>('aiLogRepository')
  ));

  container.registerFactory<CreateProjectUseCase>('createProjectUseCase', () => new CreateProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<ISubdomainService>('subdomainService'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<CreateProjectFromPromptUseCase>('createProjectFromPromptUseCase', () => new CreateProjectFromPromptUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<ISubdomainService>('subdomainService'),
    container.get<IQueueService>('queueService')
  ));

  container.registerFactory<GetProjectDetailsUseCase>('getProjectDetailsUseCase', () => new GetProjectDetailsUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IChatMessageRepository>('chatMessageRepository'),
    container.get<IMediaRepository>('mediaRepository'),
    container.get<IStorageService>('storageService')
  ));

  container.registerFactory<UpdateProjectUseCase>('updateProjectUseCase', () => new UpdateProjectUseCase(
    container.get<IProjectRepository>('projectRepository')
  ));

  container.registerFactory<UndoVersionUseCase>('undoVersionUseCase', () => new UndoVersionUseCase(
    container.get<IBuildRepository>('buildRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IStorageService>('storageService')
  ));

  container.registerFactory<DeleteProjectUseCase>('deleteProjectUseCase', () => new DeleteProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
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
    container.get<IBuildRepository>('buildRepository')
  ));

  // Register Controllers
  container.registerFactory<PromptController>('promptController', () => new PromptController(
    container.get<CreatePromptUseCase>('createPromptUseCase'),
    container.get<GetPromptStatusUseCase>('getPromptStatusUseCase'),
    container.get<AnalyzePromptUseCase>('analyzePromptUseCase')
  ));

  container.registerFactory<ProjectController>('projectController', () => new ProjectController(
    container.get<CreateProjectUseCase>('createProjectUseCase'),
    container.get<CreateProjectFromPromptUseCase>('createProjectFromPromptUseCase'),
    container.get<GetProjectDetailsUseCase>('getProjectDetailsUseCase'),
    container.get<UpdateProjectUseCase>('updateProjectUseCase'),
    container.get<UndoVersionUseCase>('undoVersionUseCase'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IQueueService>('queueService'),
    container.get<IStorageService>('storageService')
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
      container.get<IPublicMediaStorageService>('r2PublicMediaService'),
      container.get<ILogger>('logger')
    );
  });

  // Register Media Controller
  container.registerFactory<MediaController>('mediaController', () => new MediaController(
    container.get<GeneratePresignedUploadUseCase>('generatePresignedUploadUseCase'),
    container.get<ConfirmMediaUploadUseCase>('confirmMediaUploadUseCase'),
    container.get<DeleteMediaUseCase>('deleteMediaUseCase')
  ));

  // Register Inspo Use Cases
  container.registerFactory<GetInspoGalleryUseCase>('getInspoGalleryUseCase', () => new GetInspoGalleryUseCase(
    container.get<IInspoRepository>('inspoRepository')
  ));

  // Register Inspo Controller
  container.registerFactory<InspoController>('inspoController', () => new InspoController(
    container.get<GetInspoGalleryUseCase>('getInspoGalleryUseCase')
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
    container.get<IProjectRepository>('projectRepository'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService')
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
    container.get<IDNSVerificationService>('dnsVerificationService'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService')
  ));

  container.registerFactory<RemoveCustomDomainUseCase>('removeCustomDomainUseCase', () => new RemoveCustomDomainUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService')
  ));

  // Register Billing Use Cases
  container.registerFactory<CheckWorkspaceCreditsUseCase>('checkWorkspaceCreditsUseCase', () => new CheckWorkspaceCreditsUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository')
  ));

  container.registerFactory<ConsumeCreditsUseCase>('consumeCreditsUseCase', () => new ConsumeCreditsUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository')
  ));

  container.registerFactory<PurchaseCreditsUseCase>('purchaseCreditsUseCase', () => new PurchaseCreditsUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<ICreditPurchaseRepository>('creditPurchaseRepository'),
    container.get<IStripeService>('stripeService')
  ));

  container.registerFactory<UpgradeSubscriptionUseCase>('upgradeSubscriptionUseCase', () => new UpgradeSubscriptionUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IStripeService>('stripeService')
  ));

  container.registerFactory<CancelSubscriptionUseCase>('cancelSubscriptionUseCase', () => new CancelSubscriptionUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IStripeService>('stripeService')
  ));

  container.registerFactory<ResetMonthlyCreditsUseCase>('resetMonthlyCreditsUseCase', () => new ResetMonthlyCreditsUseCase(
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<ILogger>('logger')
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

  // Register Billing Controller
  container.registerFactory<BillingController>('billingController', () => new BillingController(
    container.get<CheckWorkspaceCreditsUseCase>('checkWorkspaceCreditsUseCase'),
    container.get<PurchaseCreditsUseCase>('purchaseCreditsUseCase'),
    container.get<UpgradeSubscriptionUseCase>('upgradeSubscriptionUseCase'),
    container.get<CancelSubscriptionUseCase>('cancelSubscriptionUseCase'),
    container.get<ICreditPurchaseRepository>('creditPurchaseRepository')
  ));

  // Register Stripe Webhook Controller
  container.registerFactory<StripeWebhookController>('stripeWebhookController', () => new StripeWebhookController(
    container.get<IStripeService>('stripeService'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<PurchaseCreditsUseCase>('purchaseCreditsUseCase')
  ));

  return container;
}