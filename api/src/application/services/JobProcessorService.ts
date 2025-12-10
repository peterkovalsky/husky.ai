import { IQueueService, QueueMessage, JobMessage, DeleteProjectMessage, DeleteMediaMessage, PublishProjectMessage, UnpublishProjectMessage, ProvisionHostnameMessage } from '../../domain/services/IQueueService';
import { ProcessJobUseCase } from '../use-cases/ProcessJobUseCase';
import { DeleteProjectUseCase } from '../use-cases/DeleteProjectUseCase';
import { ProcessMediaDeletionUseCase } from '../use-cases/ProcessMediaDeletionUseCase';
import { ProcessPublishJobUseCase } from '../use-cases/ProcessPublishJobUseCase';
import { ProcessUnpublishJobUseCase } from '../use-cases/ProcessUnpublishJobUseCase';
import { ProvisionHostnameUseCase } from '../use-cases/ProvisionHostnameUseCase';
import { ILogger } from '../../shared/logger/Logger';

export class JobProcessorService {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    private queueService: IQueueService,
    private processJobUseCase: ProcessJobUseCase,
    private deleteProjectUseCase: DeleteProjectUseCase,
    private processMediaDeletionUseCase: ProcessMediaDeletionUseCase,
    private processPublishJobUseCase: ProcessPublishJobUseCase,
    private processUnpublishJobUseCase: ProcessUnpublishJobUseCase,
    private provisionHostnameUseCase: ProvisionHostnameUseCase,
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
        await this.processMessage(message.body, message.receiptHandle);
      }
    } catch (error) {
      this.logger.error("Error processing messages", { error });
      // Continue processing even if there's an error
    }
  }

  private async processMessage(message: QueueMessage, receiptHandle: string): Promise<void> {
    try {
      if ('action' in message) {
        if (message.action === 'DELETE_PROJECT') {
          // Handle project deletion
          this.logger.info(`Processing delete project message`, { projectId: message.projectId });
          await this.deleteProjectUseCase.execute(message as DeleteProjectMessage);
        } else if (message.action === 'DELETE_MEDIA') {
          // Handle media deletion
          this.logger.info(`Processing delete media message`, { mediaId: message.mediaId });
          await this.processMediaDeletionUseCase.execute(message as DeleteMediaMessage);
        } else if (message.action === 'PUBLISH') {
          // Handle project publishing
          const publishMessage = message as PublishProjectMessage;
          this.logger.info(`Processing publish project message`, { projectId: publishMessage.projectId });
          await this.processPublishJobUseCase.execute(publishMessage.projectId);
        } else if (message.action === 'UNPUBLISH') {
          // Handle project unpublishing
          const unpublishMessage = message as UnpublishProjectMessage;
          this.logger.info(`Processing unpublish project message`, { projectId: unpublishMessage.projectId });
          await this.processUnpublishJobUseCase.execute(unpublishMessage.projectId);
        } else if (message.action === 'PROVISION_HOSTNAME') {
          // Handle hostname provisioning
          const provisionMessage = message as ProvisionHostnameMessage;
          this.logger.info(`Processing provision hostname message`, { projectId: provisionMessage.projectId, subdomain: provisionMessage.subdomain });
          await this.provisionHostnameUseCase.execute(provisionMessage.projectId, provisionMessage.subdomain);
        }
      } else {
        // Handle regular job processing (builds)
        const jobMessage = message as JobMessage;
        console.log(`[JobProcessorService] Received job message:`, JSON.stringify(jobMessage, null, 2));
        this.logger.info(`Processing job message`, { buildId: jobMessage.buildId });
        await this.processJobUseCase.execute(jobMessage);
      }

      // Delete the message from queue since it was processed successfully
      await this.queueService.deleteMessage(receiptHandle);
    } catch (error) {
      const messageId = 'action' in message
        ? (message.action === 'DELETE_MEDIA' ? message.mediaId : message.projectId)
        : (message as JobMessage).buildId;
      this.logger.error(`Error processing message`, {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Delete the message from queue to prevent reprocessing
      await this.queueService.deleteMessage(receiptHandle);
    }
  }
}