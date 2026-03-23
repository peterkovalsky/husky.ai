import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { setupContainer } from './shared/container/ContainerSetup';
import { loadAppConfig } from './shared/config/AppConfig';
import { ILogger } from './shared/logger/Logger';
import { JobProcessorService } from './application/services/JobProcessorService';
import { getPostHogErrorTracker } from './infrastructure/monitoring/PostHogErrorTracker';
import { IProjectEnvironmentService } from './domain/services/IProjectEnvironmentService';
import { IScreenshotService } from './infrastructure/screenshot/ScreenshotService';
import { TaskController } from './presentation/controllers/TaskController';
import { createCloudTasksAuthMiddleware } from './presentation/middleware/CloudTasksAuthMiddleware';

const config = loadAppConfig();

// Setup dependency injection container
const container = setupContainer();

// Get logger from container
const logger = container.get<ILogger>('logger');

// Determine queue provider - controls whether we use SQS polling or Cloud Tasks HTTP
const queueProvider = process.env.QUEUE_PROVIDER || 'cloudtasks';
const useSQSPolling = queueProvider === 'sqs';

// Initialize Vite cache on startup (non-blocking)
const projectEnvironmentService = container.get<IProjectEnvironmentService>('projectEnvironmentService');
projectEnvironmentService.initializeViteCache()
  .then(() => logger.info('Vite cache initialization complete'))
  .catch(err => logger.warn('Vite cache initialization failed (non-fatal)', err));

// Express server for health checks and Cloud Tasks endpoint
const app = express();
const port = parseInt(process.env.WORKER_PORT || '3334', 10);

// Parse JSON body for Cloud Tasks endpoint
app.use(express.json());

// Get screenshot service for graceful shutdown
const screenshotService = container.get<IScreenshotService>('screenshotService');

// Variables for polling mode (only used if QUEUE_PROVIDER=sqs)
let jobProcessorService: JobProcessorService | null = null;

if (useSQSPolling) {
  // Initialize job processor service for SQS polling mode
  jobProcessorService = new JobProcessorService(
    container.get('queueService'),
    container.get('processJobUseCase'),
    container.get('deleteProjectUseCase'),
    container.get('processMediaDeletionUseCase'),
    container.get('processPublishJobUseCase'),
    container.get('processUnpublishJobUseCase'),
    container.get('provisionHostnameUseCase'),
    container.get('processScreenshotUseCase'),
    logger,
    config.jobProcessor.intervalMs
  );

  // Register job processor in container for health checks
  container.register('jobProcessorService', jobProcessorService);

  logger.info('Using SQS polling mode');
} else {
  logger.info('Using Cloud Tasks push mode');
}

// Health check endpoint (always available, no auth required)
app.get('/health', (_req, res) => {
  const status: Record<string, unknown> = {
    status: 'healthy',
    service: 'worker',
    timestamp: new Date().toISOString(),
    queueProvider,
  };

  if (jobProcessorService) {
    status.processor = jobProcessorService.getStatus();
  }

  res.json(status);
});

// Cloud Tasks endpoint (only used when QUEUE_PROVIDER=cloudtasks)
if (!useSQSPolling) {
  const taskController = container.get<TaskController>('taskController');
  const expectedServiceAccount = process.env.CLOUD_TASKS_SERVICE_ACCOUNT || '';

  // Create auth middleware
  const authMiddleware = createCloudTasksAuthMiddleware({
    expectedServiceAccount,
    skipAuth: process.env.SKIP_CLOUD_TASKS_AUTH === 'true',
  });

  // POST /tasks/process - receives tasks from Cloud Tasks
  app.post('/tasks/process', authMiddleware, (req, res) => {
    taskController.processTask(req, res);
  });

  logger.info('Cloud Tasks endpoint registered at POST /tasks/process');
}

const server = app.listen(port, () => {
  logger.info(`Worker server running on port ${port}`);

  if (useSQSPolling && jobProcessorService) {
    // Start the job processor for SQS polling mode
    jobProcessorService.start();
    logger.info('SQS polling started');
  } else {
    logger.info('Waiting for Cloud Tasks push requests');
  }
});

// Graceful shutdown handlers
const SHUTDOWN_TIMEOUT_MS = 25000; // 25 seconds - App Runner default is 30s

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down worker gracefully...`);

  // Force exit after timeout to prevent hanging
  const forceExitTimeout = setTimeout(() => {
    logger.error(`Graceful shutdown timeout after ${SHUTDOWN_TIMEOUT_MS}ms - forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't let this timeout keep the process alive if everything else closes
  forceExitTimeout.unref();

  // Stop accepting new jobs (only relevant for polling mode)
  if (jobProcessorService) {
    jobProcessorService.stop();
  }

  // Close browser instance if running
  try {
    await screenshotService.shutdown();
    logger.info('Screenshot service shut down');
  } catch (error) {
    logger.warn('Error shutting down screenshot service:', error);
  }

  // Close HTTP server (stops accepting new connections, waits for existing)
  server.close(() => {
    clearTimeout(forceExitTimeout);
    logger.info('Worker shutdown complete');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Shutdown PostHog on exit
process.on('beforeExit', async () => {
  try {
    const postHog = getPostHogErrorTracker();
    await postHog.shutdown();
    logger.info('PostHog shut down successfully');
  } catch (error) {
    // PostHog might not be configured, ignore
  }
});
