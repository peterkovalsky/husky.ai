import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AnthropicService } from './services/AnthropicService';
import { JobStatusService } from './services/JobStatusService';
import { SQSService } from './services/SQSService';
import { S3Service } from './services/S3Service';
import { JobProcessor } from './services/JobProcessor';

const app = express();
const port = process.env.PORT || 3000;

// Initialize services
const aiService = new AnthropicService();
const jobStatusService = new JobStatusService();

// Initialize AWS services with error handling
let sqsService: SQSService;
let s3Service: S3Service;
let jobProcessor: JobProcessor;

try {
  sqsService = new SQSService();
  s3Service = new S3Service();
  jobProcessor = new JobProcessor(sqsService, jobStatusService, s3Service, aiService);
  console.log('AWS services initialized successfully');
} catch (error) {
  console.error('Failed to initialize AWS services:', error);
  console.error('Please check your AWS configuration in environment variables');
  process.exit(1);
}

app.use(express.json());

// Increase timeout for all requests to 5 minutes
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ message: 'Hello World!' });
});

app.get('/health', (_req, res) => {
  const processorStatus = jobProcessor.getStatus();
  const jobCounts = {
    total: jobStatusService.getAllJobs().length,
    queued: jobStatusService.getAllJobs().filter(j => j.status === 'QUEUED').length,
    processing: jobStatusService.getAllJobs().filter(j => j.status === 'PROCESSING').length,
    building: jobStatusService.getAllJobs().filter(j => j.status === 'BUILDING').length,
    ready: jobStatusService.getAllJobs().filter(j => j.status === 'READY').length
  };
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    processor: processorStatus,
    jobs: jobCounts
  });
});

app.post('/prompt', async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required and must be a string' });
  }
  
  try {
    // Generate unique job ID
    const jobId = uuidv4();
    
    console.log(`Creating job ${jobId} for prompt:`, prompt.substring(0, 100) + '...');
    
    // Create job in status service
    const job = jobStatusService.createJob(jobId, prompt);
    
    // Send message to SQS
    const message = {
      jobId,
      prompt,
      timestamp: new Date().toISOString()
    };
    
    await sqsService.sendMessage(message);
    
    res.json({
      message: 'Job queued successfully',
      jobId,
      status: job.status,
      timestamp: job.createdAt.toISOString()
    });
  } catch (error) {
    console.error('Error queuing job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    res.status(500).json({
      error: 'Failed to queue job',
      details: errorMessage
    });
  }
});

app.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }
  
  const job = jobStatusService.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json({
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    previewUrl: job.previewUrl,
    errorMessage: job.errorMessage
  });
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Start the job processor
  jobProcessor.start();
  
  // Set up cleanup for old jobs every hour
  setInterval(() => {
    jobStatusService.cleanupOldJobs();
  }, 3600000); // 1 hour
});

// Set server timeout to 5 minutes and keepalive
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 300000; // 5 minutes
server.headersTimeout = 310000; // slightly longer than keepAliveTimeout

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  jobProcessor.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  jobProcessor.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});