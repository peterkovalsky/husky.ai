import { app, config, logger, container } from './app';
import { JobProcessorService } from './application/services/JobProcessorService';

// Validate critical services are properly configured
try {
  // Test AWS services initialization
  container.get('storageService');
  container.get('queueService');
  logger.info('AWS services (S3, SQS) initialized successfully');
} catch (error) {
  logger.error('Failed to initialize AWS services. Please check your environment variables:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    requiredVars: [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY', 
      'AWS_REGION',
      'S3_BUCKET_NAME',
      'S3_VERSIONS_BUCKET_NAME',
      'SQS_QUEUE_URL'
    ]
  });
  logger.error('Copy .env.example to .env and configure your AWS credentials');
  process.exit(1);
}

// Initialize job processor service
const jobProcessorService = new JobProcessorService(
  container.get('queueService'),
  container.get('processJobUseCase'),
  logger,
  config.jobProcessor.intervalMs
);

// Register job processor in container for health checks
container.register('jobProcessorService', jobProcessorService);

const server = app.listen(config.port, () => {
  logger.info(`Server running at http://localhost:${config.port}`);
  
  // Start the job processor
  jobProcessorService.start();
});

// Set server timeouts
server.timeout = config.timeouts.server;
server.keepAliveTimeout = config.timeouts.keepAlive;
server.headersTimeout = config.timeouts.headers;

// Graceful shutdown handlers
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  jobProcessorService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));