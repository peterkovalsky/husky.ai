import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { setupExpressErrorHandler } from 'posthog-node';
import { setupContainer } from './shared/container/ContainerSetup';
import { loadAppConfig } from './shared/config/AppConfig';
import { ILogger } from './shared/logger/Logger';
import { IPostHogErrorTracker } from './infrastructure/monitoring/PostHogErrorTracker';
import { createApiRoutes } from './presentation/routes/api';
import { JobProcessorService } from './application/services/JobProcessorService';
import { ErrorMiddleware } from './presentation/middleware/ErrorMiddleware';
import { requestIdMiddleware } from './presentation/middleware/RequestIdMiddleware';

const app = express();
const config = loadAppConfig();

// Setup dependency injection container
const container = setupContainer();

// Get logger from container (with PostHog integration)
const logger = container.get<ILogger>('logger');

// Request ID middleware (must be first for proper tracking)
app.use(requestIdMiddleware);

// Configure CORS
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook needs raw body for signature verification
// Must be BEFORE the JSON body parser
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Increase request size limit for large prompts and project data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Increase timeout for all requests
app.use((_req, res, next) => {
  res.setTimeout(config.timeouts.request, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({ message: 'Hello World!' });
});

app.get('/health', (_req, res) => {
  const jobProcessor = container.get<JobProcessorService>('jobProcessorService');
  const processorStatus = jobProcessor.getStatus();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    processor: processorStatus
  });
});

// Setup API routes
const apiRoutes = createApiRoutes({
  authMiddleware: container.get('authMiddleware'),
  workspaceAccessMiddleware: container.get('workspaceAccessMiddleware'),
  promptController: container.get('promptController'),
  projectController: container.get('projectController'),
  workspaceController: container.get('workspaceController'),
  userController: container.get('userController'),
  mediaController: container.get('mediaController'),
  publishingController: container.get('publishingController'),
  customDomainController: container.get('customDomainController'),
  billingController: container.get('billingController'),
  stripeWebhookController: container.get('stripeWebhookController'),
});

app.use('/api', apiRoutes);

// Setup PostHog Express error handler for exception autocapture
// This must be set up BEFORE the global error middleware
// Required for Express apps because Express handles uncaught exceptions internally
const postHogErrorTracker = container.get<IPostHogErrorTracker>('postHogErrorTracker');
const postHogClient = postHogErrorTracker.getClient();
if (postHogClient) {
  setupExpressErrorHandler(postHogClient, app);
  console.log('[PostHog] Express error handler configured for exception autocapture');
}

// Global error handling middleware (MUST be last)
const errorMiddleware = new ErrorMiddleware(logger);
app.use(errorMiddleware.handle());

export { app, config, logger, container };