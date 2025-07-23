import { SQSService, JobMessage } from './SQSService';
import { JobStatusService } from './JobStatusService';
import { S3Service } from './S3Service';
import { AnthropicService } from './AnthropicService';
import { DatabaseService } from './DatabaseService';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

export class JobProcessor {
  private sqsService: SQSService;
  private jobStatusService: JobStatusService;
  private s3Service: S3Service;
  private aiService: AnthropicService;
  private databaseService: DatabaseService;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    sqsService: SQSService,
    jobStatusService: JobStatusService,
    s3Service: S3Service,
    aiService: AnthropicService,
    databaseService: DatabaseService
  ) {
    this.sqsService = sqsService;
    this.jobStatusService = jobStatusService;
    this.s3Service = s3Service;
    this.aiService = aiService;
    this.databaseService = databaseService;
  }

  start(): void {
    if (this.isProcessing) {
      console.log('Job processor is already running');
      return;
    }

    this.isProcessing = true;
    console.log('Starting job processor...');
    
    // Start processing messages immediately
    this.processMessages();
    
    // Set up interval to process messages every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processMessages();
    }, 5000);
  }

  stop(): void {
    if (!this.isProcessing) {
      console.log('Job processor is not running');
      return;
    }

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log('Job processor stopped');
  }

  private async processMessages(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    try {
      // Receive messages from SQS
      const result = await this.sqsService.receiveMessages(1);
      
      if (result.messages.length === 0) {
        return; // No messages to process
      }

      for (const message of result.messages) {
        await this.processJob(message.body, message.receiptHandle);
      }
    } catch (error) {
      console.error('Error processing messages:', error);
      // Continue processing even if there's an error
    }
  }

  private async processJob(jobMessage: JobMessage, receiptHandle: string): Promise<void> {
    const { promptId, jobId, prompt, projectId, userId } = jobMessage;
    const actualPromptId = promptId || jobId; // Support both old and new message format
    
    try {
      console.log(`Processing prompt ${actualPromptId}...`);
      
      // Update prompt status to PROCESSING in database
      await this.databaseService.updatePromptStatus(actualPromptId, 'PROCESSING');
      
      // Also update in-memory for backward compatibility
      this.jobStatusService.updateJobStatus(actualPromptId, 'PROCESSING');
      
      // Set project context for AnthropicService if we have a projectId
      if (projectId && 'setProjectContext' in this.aiService && typeof this.aiService.setProjectContext === 'function') {
        await (this.aiService as any).setProjectContext(this.databaseService, projectId);
      }
      
      // Get conversation context if projectId is available
      let contextPrompt = prompt;
      if (projectId) {
        const previousPrompts = await this.databaseService.getPromptsByProjectId(projectId);
        const conversation = previousPrompts
          .filter(p => p.id !== actualPromptId) // Exclude current prompt
          .map(p => `User: ${p.prompt}`)
          .join('\n\n');
        
        if (conversation) {
          contextPrompt = `Previous conversation:\n${conversation}\n\nCurrent request: ${prompt}`;
        }

        // Note: File tree is now loaded directly into AnthropicService via setProjectContext
      }
      
      // AI stage: Generate response using existing AI service
      console.log(`Running AI stage for prompt ${actualPromptId}...`);
      const aiResponse = await this.aiService.generateResponse(contextPrompt, actualPromptId);
      
      // Parse the AI response to get the app directory
      const responseData = JSON.parse(aiResponse.content);
      const appDirectory = responseData.appDirectory;
      
      if (!appDirectory) {
        throw new Error('No app directory found in AI response');
      }

      // Save file tree to database if we have a project
      if (projectId) {
        await this.databaseService.saveFileTree(this.aiService.getCurrentFileTree(), projectId);
      }

      // Update prompt status to BUILDING
      await this.databaseService.updatePromptStatus(actualPromptId, 'BUILDING');
      this.jobStatusService.updateJobStatus(actualPromptId, 'BUILDING', {
        appDirectory
      });

      // Build stage: Check for build errors and potentially fix with AI agent
      console.log(`Running build stage for prompt ${actualPromptId}...`);
      const finalAppDirectory = await this.handleBuildWithRetry(appDirectory, actualPromptId, projectId);
      
      // Upload to S3
      const uploadResult = await this.s3Service.uploadReactApp(finalAppDirectory, actualPromptId);
      
      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to S3: ${uploadResult.error}`);
      }

      // Save preview URL to database
      if (projectId) {
        await this.databaseService.createPreview(uploadResult.previewUrl!, projectId, actualPromptId);
      }

      // Update prompt status to READY
      await this.databaseService.updatePromptStatus(actualPromptId, 'READY');
      this.jobStatusService.updateJobStatus(actualPromptId, 'READY', {
        previewUrl: uploadResult.previewUrl
      });

      console.log(`Prompt ${actualPromptId} completed successfully. Preview URL: ${uploadResult.previewUrl}`);
      
      // Delete the message from SQS since it was processed successfully
      await this.sqsService.deleteMessage(receiptHandle);
      
    } catch (error) {
      console.error(`Error processing prompt ${actualPromptId}:`, error);
      
      // Update prompt status with error in database
      await this.databaseService.updatePromptStatus(actualPromptId, 'FAILED');
      
      // Update job status with error in memory
      this.jobStatusService.updateJobStatus(actualPromptId, 'FAILED', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      
      // Delete the message from SQS to prevent reprocessing
      await this.sqsService.deleteMessage(receiptHandle);
    }
  }

  // Method to get processor status
  getStatus(): { isProcessing: boolean; uptime?: number } {
    return {
      isProcessing: this.isProcessing
    };
  }

  private async handleBuildWithRetry(appDirectory: string, promptId: string, projectId?: string): Promise<string> {
    const execAsync = promisify(exec);
    const maxRetries = 3;
    let currentDirectory = appDirectory;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Build attempt ${attempt}/${maxRetries} for prompt ${promptId}...`);

      try {
        // Check if build already exists
        const distPath = path.join(currentDirectory, 'dist');
        if (fs.existsSync(distPath)) {
          console.log(`Build successful on attempt ${attempt}`);
          return currentDirectory;
        }

        // Try to build
        const buildResult = await this.tryBuild(currentDirectory);
        
        if (buildResult.success) {
          console.log(`Build successful on attempt ${attempt}`);
          return currentDirectory;
        }

        // If we have errors and attempts remaining, try to fix with AI agent
        if (attempt < maxRetries) {
          console.log(`Build failed on attempt ${attempt}, trying to fix with AI agent...`);
          console.log(`Build errors:`, buildResult.error);

          const fixedDirectory = await this.fixBuildErrorsWithAI(
            currentDirectory, 
            buildResult.error || 'Unknown build error',
            promptId
          );

          if (fixedDirectory) {
            currentDirectory = fixedDirectory;
            // Update file tree in database if we have a project
            if (projectId && this.databaseService) {
              const fileTree = await this.getFileTree(currentDirectory);
              await this.databaseService.saveFileTree(fileTree, projectId);
            }
          } else {
            console.log(`AI agent could not fix build errors on attempt ${attempt}`);
          }
        }

      } catch (error) {
        console.error(`Build attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw new Error(`Build failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    throw new Error(`Build failed after ${maxRetries} attempts`);
  }

  private async tryBuild(appDirectory: string): Promise<{ success: boolean; output?: string; error?: string }> {
    const execAsync = promisify(exec);
    
    try {
      // Check if package.json exists to determine the build command
      const packageJsonPath = path.join(appDirectory, 'package.json');
      let buildCommand = 'npm run build';

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          // Check if vite is available, prefer vite build over npm run build
          if (packageJson.devDependencies?.vite || packageJson.dependencies?.vite) {
            buildCommand = 'npx vite build';
          }
        } catch (error) {
          console.warn('Failed to parse package.json, using default build command:', error);
        }
      }

      // Install dependencies first
      console.log('Installing dependencies...');
      const packageLockPath = path.join(appDirectory, 'package-lock.json');
      const installCommand = fs.existsSync(packageLockPath)
        ? 'npm ci --silent --no-audit --no-fund'
        : 'npm install --silent --no-audit --no-fund';

      await execAsync(installCommand, {
        cwd: appDirectory,
        timeout: 180000, // 3 minutes timeout
        killSignal: 'SIGTERM'
      });

      // Run build command
      console.log('Running build...');
      const { stdout, stderr } = await execAsync(buildCommand, {
        cwd: appDirectory,
        timeout: 120000, // 2 minutes timeout
        killSignal: 'SIGTERM'
      });

      return {
        success: true,
        output: stdout,
        error: stderr || undefined
      };

    } catch (error: any) {
      console.error('Build process error:', error);

      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message
      };
    }
  }

  private async fixBuildErrorsWithAI(
    appDirectory: string, 
    buildError: string, 
    promptId: string
  ): Promise<string | null> {
    try {
      // Create a dedicated AI service instance for build error fixing
      const buildFixAI = new AnthropicService();

      // Get current file tree
      const fileTree = await this.getFileTree(appDirectory);
      
      // Create prompt for AI agent to fix build errors
      const fixPrompt = `You are a build error fixing specialist. Your only job is to analyze build errors and fix the code.

Current file tree and contents:
${JSON.stringify(fileTree, null, 2)}

Build Error:
${buildError}

Please analyze the build error and provide a JSON response with file modifications needed to fix it. Only include files that need to be changed.

Response format:
{
  "analysis": "Brief explanation of what's wrong and how to fix it",
  "files": {
    "path/to/file.js": "complete new file content",
    "path/to/another/file.json": "complete new file content"
  }
}

Focus only on fixing the build error. Do not add new features or make unnecessary changes.`;

      console.log('Sending build error to AI agent for fixing...');
      const aiResponse = await buildFixAI.generateResponse(fixPrompt, `${promptId}-build-fix`);

      // Parse AI response
      const responseData = JSON.parse(aiResponse.content);
      
      if (!responseData.files || typeof responseData.files !== 'object') {
        console.error('AI agent did not provide valid file fixes');
        return null;
      }

      console.log(`AI agent analysis: ${responseData.analysis || 'No analysis provided'}`);
      console.log(`AI agent provided fixes for ${Object.keys(responseData.files).length} files`);

      // Create new directory for fixed version
      const fixedDirectory = `${appDirectory}-fixed-${Date.now()}`;
      await this.copyDirectory(appDirectory, fixedDirectory);

      // Apply AI fixes
      for (const [filePath, content] of Object.entries(responseData.files)) {
        const fullPath = path.join(fixedDirectory, filePath as string);
        const dir = path.dirname(fullPath);
        
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the fixed file
        if (content === '__DELETE__') {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } else {
          fs.writeFileSync(fullPath, content as string, 'utf8');
        }
        
        console.log(`Applied AI fix to: ${filePath}`);
      }

      return fixedDirectory;

    } catch (error) {
      console.error('Error in AI build error fixing:', error);
      return null;
    }
  }

  private async getFileTree(directory: string): Promise<any[]> {
    const fileTree: any[] = [];

    const processDirectory = (dir: string, basePath: string = '') => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        // Skip node_modules, .git, dist, and other build artifacts
        if (['node_modules', '.git', 'dist', 'build', '.next', '.cache'].includes(item)) {
          continue;
        }

        const fullPath = path.join(dir, item);
        const relativePath = basePath ? path.join(basePath, item) : item;
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          processDirectory(fullPath, relativePath);
        } else {
          // Only include source files
          const ext = path.extname(item).toLowerCase();
          if (['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.md'].includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              fileTree.push({
                path: relativePath,
                content: content
              });
            } catch (error) {
              console.warn(`Could not read file ${relativePath}:`, error);
            }
          }
        }
      }
    };

    processDirectory(directory);
    return fileTree;
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);
    
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}