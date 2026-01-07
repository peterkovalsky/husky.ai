import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { setupContainer } from './shared/container/ContainerSetup';
import { loadAppConfig } from './shared/config/AppConfig';
import { ILogger } from './shared/logger/Logger';
import { JobProcessorService } from './application/services/JobProcessorService';
import { getPostHogErrorTracker } from './infrastructure/monitoring/PostHogErrorTracker';

const config = loadAppConfig();

// Setup dependency injection container
const container = setupContainer();

// Get logger from container
const logger = container.get<ILogger>('logger');

// Minimal Express server for health checks only
const app = express();
const port = parseInt(process.env.WORKER_PORT || '3334', 10);

// Initialize job processor service
const jobProcessorService = new JobProcessorService(
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

// Health check endpoint
app.get('/health', (_req, res) => {
  const processorStatus = jobProcessorService.getStatus();

  res.json({
    status: 'healthy',
    service: 'worker',
    timestamp: new Date().toISOString(),
    processor: processorStatus
  });
});

const server = app.listen(port, () => {
  logger.info(`Worker health server running on port ${port}`);

  // Start the job processor
  jobProcessorService.start();
});

// Graceful shutdown handlers
const SHUTDOWN_TIMEOUT_MS = 25000; // 25 seconds - App Runner default is 30s

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down worker gracefully...`);

  // Force exit after timeout to prevent hanging
  const forceExitTimeout = setTimeout(() => {
    logger.error(`Graceful shutdown timeout after ${SHUTDOWN_TIMEOUT_MS}ms - forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't let this timeout keep the process alive if everything else closes
  forceExitTimeout.unref();

  // Stop accepting new jobs
  jobProcessorService.stop();

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
