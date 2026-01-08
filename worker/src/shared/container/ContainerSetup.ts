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
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { IChatMessageRepository } from '../../domain/repositories/IChatMessageRepository';

// Domain Services
import { IAIService } from '../../domain/services/IAIService';
import { IAIProvider } from '../../domain/services/IAIProvider';
import { IStorageService } from '../../domain/services/IStorageService';
import { IQueueService } from '../../domain/services/IQueueService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IProjectEnvironmentService } from '../../domain/services/IProjectEnvironmentService';
import { IImageProcessingService } from '../../domain/services/IImageProcessingService';

// Infrastructure Implementations
import { SupabaseWorkspaceRepository } from '../../infrastructure/database/SupabaseWorkspaceRepository';
import { SupabaseProjectRepository } from '../../infrastructure/database/SupabaseProjectRepository';
import { SupabaseBuildRepository } from '../../infrastructure/database/SupabaseBuildRepository';
import { SupabaseMediaRepository } from '../../infrastructure/database/SupabaseMediaRepository';
import { SupabaseInspoRepository } from '../../infrastructure/database/SupabaseInspoRepository';
import { SupabaseAILogRepository } from '../../infrastructure/database/SupabaseAILogRepository';
import { SupabaseChatMessageRepository } from '../../infrastructure/database/SupabaseChatMessageRepository';
import { AnthropicProvider } from '../../infrastructure/ai/AnthropicProvider';
import { OpenAIProvider } from '../../infrastructure/ai/OpenAIProvider';
import { GeminiProvider } from '../../infrastructure/ai/GeminiProvider';
import { AIService } from '../../infrastructure/ai/AIService';
import { S3StorageService } from '../../infrastructure/storage/S3StorageService';
import { SQSQueueService } from '../../infrastructure/queue/SQSQueueService';
import { BuildService } from '../../infrastructure/build/BuildService';
import { ProjectEnvironmentService } from '../../infrastructure/build/ProjectEnvironmentService';
import { R2PublishedAppsService } from '../../infrastructure/storage/R2PublishedAppsService';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';
import { DNSVerificationService, IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';
import { ImageProcessingService } from '../../infrastructure/services/ImageProcessingService';
import { ScreenshotService, IScreenshotService } from '../../infrastructure/screenshot/ScreenshotService';

// Application Use Cases - Worker only needs job processing use cases
import { ProcessJobUseCase } from '../../application/use-cases/ProcessJobUseCase';
import { PrepareProjectEnvironmentUseCase } from '../../application/use-cases/PrepareProjectEnvironmentUseCase';
import { DeleteProjectUseCase } from '../../application/use-cases/DeleteProjectUseCase';
import { ProcessMediaDeletionUseCase } from '../../application/use-cases/ProcessMediaDeletionUseCase';
import { ProcessPublishJobUseCase } from '../../application/use-cases/ProcessPublishJobUseCase';
import { ProcessUnpublishJobUseCase } from '../../application/use-cases/ProcessUnpublishJobUseCase';
import { ProvisionHostnameUseCase } from '../../application/use-cases/ProvisionHostnameUseCase';
import { ProcessScreenshotUseCase } from '../../application/use-cases/ProcessScreenshotUseCase';

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
      console.log(`[Worker Container] Registered Anthropic provider`);
    }

    // Add OpenAI provider if API key is configured
    if (config.ai.openaiApiKey) {
      providers.push(container.get<IAIProvider>('openaiProvider'));
      console.log(`[Worker Container] Registered OpenAI provider`);
    }

    // Add Gemini provider if API key is configured
    if (config.ai.geminiApiKey) {
      providers.push(container.get<IAIProvider>('geminiProvider'));
      console.log(`[Worker Container] Registered Gemini provider`);
    }

    if (providers.length === 0) {
      throw new Error('No AI providers configured. Please set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY');
    }

    console.log(`[Worker Container] Primary model: ${config.ai.primary.model}`);
    console.log(`[Worker Container] Fast model: ${config.ai.fast.model}`);

    return new AIService(providers, buildRepository, aiLogRepository);
  });

  // Register Infrastructure Services
  container.registerFactory<IStorageService>('storageService', () => new S3StorageService());
  container.registerFactory<IQueueService>('queueService', () => new SQSQueueService());

  container.registerFactory<IBuildService>('buildService', () => {
    const buildRepository = container.get<IBuildRepository>('buildRepository');
    return new BuildService(buildRepository);
  });

  container.registerFactory<IProjectEnvironmentService>('projectEnvironmentService', () => new ProjectEnvironmentService());

  // Cloudflare services for publishing
  container.registerFactory<R2PublishedAppsService>('r2PublishedAppsService', () => new R2PublishedAppsService());
  container.registerFactory<CloudflareSaaSService>('cloudflareSaaSService', () => new CloudflareSaaSService());
  container.registerFactory<CloudflareKVService>('cloudflareKVService', () => new CloudflareKVService());
  container.registerFactory<IDNSVerificationService>('dnsVerificationService', () => new DNSVerificationService());

  // Image processing service
  container.registerFactory<IImageProcessingService>('imageProcessingService', () => {
    const { S3Client } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const logger = container.get<ILogger>('logger');
    return new ImageProcessingService(s3Client, logger);
  });

  // Screenshot service for capturing project thumbnails
  container.registerFactory<IScreenshotService>('screenshotService', () => new ScreenshotService());

  // Register Job Processing Use Cases
  container.registerFactory<PrepareProjectEnvironmentUseCase>('prepareProjectEnvironmentUseCase', () => new PrepareProjectEnvironmentUseCase(
    container.get<IProjectEnvironmentService>('projectEnvironmentService')
  ));

  container.registerFactory<ProcessJobUseCase>('processJobUseCase', () => new ProcessJobUseCase(
    container.get<IBuildRepository>('buildRepository'),
    container.get<IProjectRepository>('projectRepository'),
    container.get<IWorkspaceRepository>('workspaceRepository'),
    container.get<IAIService>('aiService'),
    container.get<IBuildService>('buildService'),
    container.get<IStorageService>('storageService'),
    container.get<PrepareProjectEnvironmentUseCase>('prepareProjectEnvironmentUseCase'),
    container.get<IMediaRepository>('mediaRepository'),
    container.get<IImageProcessingService>('imageProcessingService'),
    container.get<IQueueService>('queueService'),
    container.get<IInspoRepository>('inspoRepository')
  ));

  container.registerFactory<DeleteProjectUseCase>('deleteProjectUseCase', () => new DeleteProjectUseCase(
    container.get<IProjectRepository>('projectRepository'),
    container.get<IBuildRepository>('buildRepository'),
    container.get<IStorageService>('storageService'),
    container.get<R2PublishedAppsService>('r2PublishedAppsService'),
    container.get<CloudflareSaaSService>('cloudflareSaaSService'),
    container.get<CloudflareKVService>('cloudflareKVService')
  ));

  container.registerFactory<ProcessMediaDeletionUseCase>('processMediaDeletionUseCase', () => {
    return new ProcessMediaDeletionUseCase(
      container.get<IMediaRepository>('mediaRepository'),
      container.get<IBuildRepository>('buildRepository'),
      container.get<IStorageService>('storageService'),
      container.get<ILogger>('logger')
    );
  });

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

  container.registerFactory<ProcessScreenshotUseCase>('processScreenshotUseCase', () => new ProcessScreenshotUseCase(
    container.get<IScreenshotService>('screenshotService'),
    container.get<IStorageService>('storageService'),
    container.get<IBuildRepository>('buildRepository')
  ));

  return container;
}
