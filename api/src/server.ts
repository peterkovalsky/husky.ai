import { app, config, logger, container } from './app';
import { handleUnhandledRejection, handleUncaughtException } from './presentation/middleware/ErrorMiddleware';
import { getPostHogErrorTracker } from './infrastructure/monitoring/PostHogErrorTracker';

// Validate critical services are properly configured
try {
  // Test storage and queue services initialization
  container.get('storageService');
  container.get('queueService');
  logger.info('Storage (R2) and queue services initialized successfully');
} catch (error) {
  logger.error('Failed to initialize storage/queue services. Please check your environment variables:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    requiredVars: [
      'CLOUDFLARE_R2_ACCESS_KEY_ID',
      'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      'CLOUDFLARE_R2_ENDPOINT',
      'CLOUDFLARE_R2_PREVIEW_BUCKET',
      'CLOUDFLARE_R2_PROJECTS_BUCKET',
      'CLOUDFLARE_R2_PUBLIC_MEDIA_BUCKET'
    ]
  });
  logger.error('Copy .env.example to .env and configure your R2 credentials');
  process.exit(1);
}

// Note: Job processing is now handled by the separate worker service
// The API is stateless and only handles HTTP requests

const server = app.listen(config.port, () => {
  logger.info(`API server running at http://localhost:${config.port}`);
  logger.info('Job processing handled by separate worker service');
});

// Set server timeouts
server.timeout = config.timeouts.server;
server.keepAliveTimeout = config.timeouts.keepAlive;
server.headersTimeout = config.timeouts.headers;

// Graceful shutdown handlers
const SHUTDOWN_TIMEOUT_MS = 25000; // 25 seconds - App Runner default is 30s

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);

  // Force exit after timeout to prevent hanging
  const forceExitTimeout = setTimeout(() => {
    logger.error(`Graceful shutdown timeout after ${SHUTDOWN_TIMEOUT_MS}ms - forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't let this timeout keep the process alive if everything else closes
  forceExitTimeout.unref();

  // Close HTTP server (stops accepting new connections, waits for existing)
  server.close(() => {
    clearTimeout(forceExitTimeout);
    logger.info('Server closed gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Global error handlers
process.on('unhandledRejection', handleUnhandledRejection(logger));
process.on('uncaughtException', handleUncaughtException(logger));

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
