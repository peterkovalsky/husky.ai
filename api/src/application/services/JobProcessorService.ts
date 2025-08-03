import { IQueueService } from '../../domain/services/IQueueService';
import { ProcessJobUseCase } from '../use-cases/ProcessJobUseCase';
import { ILogger } from '../../shared/logger/Logger';

export class JobProcessorService {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    private queueService: IQueueService,
    private processJobUseCase: ProcessJobUseCase,
    private logger: ILogger,
    private intervalMs: number = 5000
  ) {}

  start(): void {
    if (this.isProcessing) {
      this.logger.info("Job processor is already running");
      return;
    }

    this.isProcessing = true;
    this.logger.info("Starting job processor...");

    // Start processing messages immediately
    this.processMessages();

    // Set up interval to process messages
    this.processingInterval = setInterval(() => {
      this.processMessages();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.isProcessing) {
      this.logger.info("Job processor is not running");
      return;
    }

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.logger.info("Job processor stopped");
  }

  getStatus(): { isProcessing: boolean } {
    return {
      isProcessing: this.isProcessing,
    };
  }

  private async processMessages(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    try {
      // Receive messages from queue
      const result = await this.queueService.receiveMessages(1);

      if (result.messages.length === 0) {
        return; // No messages to process
      }

      for (const message of result.messages) {
        await this.processJob(message.body, message.receiptHandle);
      }
    } catch (error) {
      this.logger.error("Error processing messages", { error });
      // Continue processing even if there's an error
    }
  }

  private async processJob(jobMessage: any, receiptHandle: string): Promise<void> {
    try {
      this.logger.info(`Processing job message`, { promptId: jobMessage.promptId });

      await this.processJobUseCase.execute(jobMessage);

      // Delete the message from queue since it was processed successfully
      await this.queueService.deleteMessage(receiptHandle);
    } catch (error) {
      this.logger.error(`Error processing job`, { 
        promptId: jobMessage.promptId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Delete the message from queue to prevent reprocessing
      await this.queueService.deleteMessage(receiptHandle);
    }
  }
}