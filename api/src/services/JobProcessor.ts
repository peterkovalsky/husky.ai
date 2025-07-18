import { SQSService, JobMessage } from './SQSService';
import { JobStatusService } from './JobStatusService';
import { S3Service } from './S3Service';
import { AnthropicService } from './AnthropicService';

export class JobProcessor {
  private sqsService: SQSService;
  private jobStatusService: JobStatusService;
  private s3Service: S3Service;
  private aiService: AnthropicService;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    sqsService: SQSService,
    jobStatusService: JobStatusService,
    s3Service: S3Service,
    aiService: AnthropicService
  ) {
    this.sqsService = sqsService;
    this.jobStatusService = jobStatusService;
    this.s3Service = s3Service;
    this.aiService = aiService;
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
    const { jobId, prompt } = jobMessage;
    
    try {
      console.log(`Processing job ${jobId}...`);
      
      // Update job status to PROCESSING
      this.jobStatusService.updateJobStatus(jobId, 'PROCESSING');
      
      // AI stage: Generate response using existing AI service
      console.log(`Running AI stage for job ${jobId}...`);
      const aiResponse = await this.aiService.generateResponse(prompt);
      
      // Parse the AI response to get the app directory
      const responseData = JSON.parse(aiResponse.content);
      const appDirectory = responseData.appDirectory;
      
      if (!appDirectory) {
        throw new Error('No app directory found in AI response');
      }

      // Update job status to BUILDING
      this.jobStatusService.updateJobStatus(jobId, 'BUILDING', {
        appDirectory
      });

      // Build stage: Upload to S3
      console.log(`Running build stage for job ${jobId}...`);
      const uploadResult = await this.s3Service.uploadReactApp(appDirectory, jobId);
      
      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to S3: ${uploadResult.error}`);
      }

      // Update job status to READY with preview URL
      this.jobStatusService.updateJobStatus(jobId, 'READY', {
        previewUrl: uploadResult.previewUrl
      });

      console.log(`Job ${jobId} completed successfully. Preview URL: ${uploadResult.previewUrl}`);
      
      // Delete the message from SQS since it was processed successfully
      await this.sqsService.deleteMessage(receiptHandle);
      
    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      
      // Update job status with error
      this.jobStatusService.updateJobStatus(jobId, 'READY', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      
      // Delete the message from SQS to prevent reprocessing
      // In a production environment, you might want to implement retry logic
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