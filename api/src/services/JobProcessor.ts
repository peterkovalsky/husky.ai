import { SQSService, JobMessage } from './SQSService';
import { JobStatusService } from './JobStatusService';
import { S3Service } from './S3Service';
import { AnthropicService } from './AnthropicService';
import { DatabaseService } from './DatabaseService';

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

      // Build stage: Upload to S3
      console.log(`Running build stage for prompt ${actualPromptId}...`);
      const uploadResult = await this.s3Service.uploadReactApp(appDirectory, actualPromptId);
      
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
}