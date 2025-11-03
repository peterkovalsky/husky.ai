import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { setupContainer } from './shared/container/ContainerSetup';
import { loadAppConfig } from './shared/config/AppConfig';
import { ConsoleLogger } from './shared/logger/Logger';
import { createApiRoutes } from './presentation/routes/api';
import { JobProcessorService } from './application/services/JobProcessorService';

const app = express();
const config = loadAppConfig();
const logger = new ConsoleLogger();

// Setup dependency injection container
const container = setupContainer();

// Configure CORS
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
});

app.use('/api', apiRoutes);

export { app, config, logger, container };