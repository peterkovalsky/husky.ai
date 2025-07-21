import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { AnthropicService } from './services/AnthropicService';
import { JobStatusService } from './services/JobStatusService';
import { SQSService } from './services/SQSService';
import { S3Service } from './services/S3Service';
import { JobProcessor } from './services/JobProcessor';
import { DatabaseService } from './services/DatabaseService';
import { UserSetupService } from './services/UserSetupService';
import { authMiddleware, AuthRequest } from './middleware/AuthMiddleware';
import { workspaceAccessMiddleware } from './middleware/WorkspaceAccessMiddleware';
import { Response, NextFunction } from 'express';

const app = express();
const port = process.env.PORT || 3333;

// Initialize services
const aiService = new AnthropicService();
const jobStatusService = new JobStatusService();
const databaseService = new DatabaseService();
const userSetupService = new UserSetupService();

// Initialize AWS services with error handling
let sqsService: SQSService;
let s3Service: S3Service;
let jobProcessor: JobProcessor;

try {
  sqsService = new SQSService();
  s3Service = new S3Service();
  jobProcessor = new JobProcessor(sqsService, jobStatusService, s3Service, aiService, databaseService);
  console.log('AWS services initialized successfully');
} catch (error) {
  console.error('Failed to initialize AWS services:', error);
  console.error('Please check your AWS configuration in environment variables');
  process.exit(1);
}

// Configure CORS for cross-origin requests from frontend
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Increase timeout for all requests to 5 minutes
app.use((_req, res, next) => {
  res.setTimeout(300000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ message: 'Hello World!' });
});

// Enhanced auth middleware that ensures user setup on first login
const ensureUserSetup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if user has workspaces, if not set them up
    const workspaces = await databaseService.getWorkspacesByUserId(req.user.id);
    
    if (workspaces.length === 0) {
      console.log(`Setting up new user on first login: ${req.user.id}`);
      await userSetupService.setupNewUser(req.user.id, req.user.displayName || req.user.email);
    }

    next();
  } catch (error) {
    console.error('Error ensuring user setup:', error);
    return res.status(500).json({ error: 'Failed to setup user' });
  }
};

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

app.post('/api/prompt', authMiddleware.authenticate, ensureUserSetup, async (req: AuthRequest, res) => {
  const { prompt, project_id } = req.body;
  
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required and must be a string' });
  }
  
  try {
    let projectId = project_id;
    
    // If no project_id provided, use user's default project
    if (!projectId) {
      const defaultProject = await userSetupService.getUserDefaultProject(req.user!.id);
      if (!defaultProject) {
        return res.status(400).json({ error: 'No project found. Please specify project_id.' });
      }
      projectId = defaultProject.id;
    } else {
      // Verify user has access to the specified project
      const hasAccess = await databaseService.checkUserProjectAccess(req.user!.id, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to project' });
      }
    }
    
    console.log(`Creating prompt for project ${projectId} from user ${req.user!.id}:`, prompt.substring(0, 100) + '...');
    
    // Create prompt in database
    const dbPrompt = await databaseService.createPrompt(prompt, projectId, req.user!.id);
    
    // Create backward-compatible job for existing job processor
    jobStatusService.createJob(dbPrompt.id, prompt);
    
    // Send message to SQS with prompt_id instead of jobId
    const message = {
      promptId: dbPrompt.id,
      jobId: dbPrompt.id, // Keep for backward compatibility
      prompt,
      projectId,
      userId: req.user!.id,
      timestamp: new Date().toISOString()
    };
    
    await sqsService.sendMessage(message);
    
    res.json({
      message: 'Prompt queued successfully',
      promptId: dbPrompt.id,
      jobId: dbPrompt.id, // Keep for backward compatibility
      status: dbPrompt.status,
      projectId: projectId,
      timestamp: dbPrompt.created_at
    });
  } catch (error) {
    console.error('Error queuing prompt:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    res.status(500).json({
      error: 'Failed to queue prompt',
      details: errorMessage
    });
  }
});

app.get('/api/status/:promptId', authMiddleware.authenticate, workspaceAccessMiddleware.checkPromptAccess('promptId'), async (req: AuthRequest, res) => {
  const { promptId } = req.params;
  
  if (!promptId) {
    return res.status(400).json({ error: 'Prompt ID is required' });
  }
  
  try {
    // Get prompt from database
    const prompt = await databaseService.getPromptById(promptId);
    
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    // Get preview URL if status is READY
    let previewUrl = null;
    if (prompt.status === 'READY') {
      const preview = await databaseService.getPreviewByPromptId(promptId);
      previewUrl = preview?.preview_url || null;
    }
    
    res.json({
      promptId: prompt.id,
      jobId: prompt.id, // Keep for backward compatibility
      status: prompt.status,
      projectId: prompt.project_id,
      createdAt: prompt.created_at,
      updatedAt: prompt.modified_at,
      previewUrl: previewUrl,
      prompt: prompt.prompt
    });
  } catch (error) {
    console.error('Error getting prompt status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    res.status(500).json({
      error: 'Failed to get prompt status',
      details: errorMessage
    });
  }
});

// User setup endpoint - called during sign in
app.post('/api/user/setup', authMiddleware.authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if user already has workspaces
    const existingWorkspaces = await databaseService.getWorkspacesByUserId(req.user.id);
    
    if (existingWorkspaces.length > 0) {
      // User already set up
      return res.json({ 
        status: 'existing',
        message: 'User already has workspaces',
        workspace: existingWorkspaces[0],
        project: await userSetupService.getUserDefaultProject(req.user.id)
      });
    }

    // Setup new user
    const result = await userSetupService.setupNewUser(req.user.id, req.user.displayName || req.user.email);
    
    return res.json({
      status: 'created',
      message: 'User setup completed',
      workspace: result?.workspace,
      project: result?.project
    });
  } catch (error) {
    console.error('Error setting up user:', error);
    res.status(500).json({ error: 'Failed to setup user' });
  }
});

// API endpoints for workspace and project management
app.get('/api/workspaces', authMiddleware.authenticate, ensureUserSetup, async (req: AuthRequest, res) => {
  try {
    const workspaces = await databaseService.getWorkspacesByUserId(req.user!.id);
    res.json({ workspaces });
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

app.get('/api/projects/:workspaceId', authMiddleware.authenticate, workspaceAccessMiddleware.checkWorkspaceAccess('workspaceId'), async (req: AuthRequest, res) => {
  try {
    const { workspaceId } = req.params;
    const projects = await databaseService.getProjectsByWorkspaceId(workspaceId);
    res.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.get('/api/prompts/:projectId', authMiddleware.authenticate, workspaceAccessMiddleware.checkProjectAccess('projectId'), async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const prompts = await databaseService.getPromptsByProjectId(projectId);
    res.json({ prompts });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
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