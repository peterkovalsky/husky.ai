import { Request, Response } from 'express';
import { QueueMessage, JobMessage, DeleteProjectMessage, DeleteMediaMessage, PublishProjectMessage, UnpublishProjectMessage, ProvisionHostnameMessage, GenerateScreenshotMessage } from '../../domain/services/IQueueService';
import { ProcessJobUseCase } from '../../application/use-cases/ProcessJobUseCase';
import { DeleteProjectUseCase } from '../../application/use-cases/DeleteProjectUseCase';
import { ProcessMediaDeletionUseCase } from '../../application/use-cases/ProcessMediaDeletionUseCase';
import { ProcessPublishJobUseCase } from '../../application/use-cases/ProcessPublishJobUseCase';
import { ProcessUnpublishJobUseCase } from '../../application/use-cases/ProcessUnpublishJobUseCase';
import { ProvisionHostnameUseCase } from '../../application/use-cases/ProvisionHostnameUseCase';
import { ProcessScreenshotUseCase } from '../../application/use-cases/ProcessScreenshotUseCase';
import { ILogger } from '../../shared/logger/Logger';

export class TaskController {
  constructor(
    private processJobUseCase: ProcessJobUseCase,
    private deleteProjectUseCase: DeleteProjectUseCase,
    private processMediaDeletionUseCase: ProcessMediaDeletionUseCase,
    private processPublishJobUseCase: ProcessPublishJobUseCase,
    private processUnpublishJobUseCase: ProcessUnpublishJobUseCase,
    private provisionHostnameUseCase: ProvisionHostnameUseCase,
    private processScreenshotUseCase: ProcessScreenshotUseCase,
    private logger: ILogger
  ) {}

  /**
   * Handle incoming task from Cloud Tasks
   * Returns 2xx on success (task auto-deleted), 5xx on failure (triggers retry)
   */
  async processTask(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    try {
      const message = req.body as QueueMessage;

      if (!message) {
        this.logger.error('Received empty task body');
        res.status(400).json({ error: 'Empty task body' });
        return;
      }

      this.logger.info('Processing Cloud Tasks message', {
        messageType: 'action' in message ? message.action : 'BUILD',
        messageId: this.getMessageId(message),
      });

      await this.processMessage(message);

      const duration = Date.now() - startTime;
      this.logger.info('Task processed successfully', {
        messageId: this.getMessageId(message),
        durationMs: duration,
      });

      // Return 200 to acknowledge successful processing
      // Cloud Tasks will automatically delete the task
      res.status(200).json({
        success: true,
        messageId: this.getMessageId(message),
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Error processing task', {
        error: errorMessage,
        stack: errorStack,
        durationMs: duration,
      });

      // Return 500 to signal failure - Cloud Tasks will retry
      res.status(500).json({
        error: errorMessage,
        durationMs: duration,
      });
    }
  }

  private async processMessage(message: QueueMessage): Promise<void> {
    if ('action' in message) {
      switch (message.action) {
        case 'DELETE_PROJECT':
          this.logger.info('Processing delete project message', { projectId: message.projectId });
          await this.deleteProjectUseCase.execute(message as DeleteProjectMessage);
          break;

        case 'DELETE_MEDIA':
          this.logger.info('Processing delete media message', { mediaId: message.mediaId });
          await this.processMediaDeletionUseCase.execute(message as DeleteMediaMessage);
          break;

        case 'PUBLISH':
          const publishMessage = message as PublishProjectMessage;
          this.logger.info('Processing publish project message', { projectId: publishMessage.projectId });
          await this.processPublishJobUseCase.execute(publishMessage.projectId);
          break;

        case 'UNPUBLISH':
          const unpublishMessage = message as UnpublishProjectMessage;
          this.logger.info('Processing unpublish project message', { projectId: unpublishMessage.projectId });
          await this.processUnpublishJobUseCase.execute(unpublishMessage.projectId);
          break;

        case 'PROVISION_HOSTNAME':
          const provisionMessage = message as ProvisionHostnameMessage;
          this.logger.info('Processing provision hostname message', {
            projectId: provisionMessage.projectId,
            subdomain: provisionMessage.subdomain,
          });
          await this.provisionHostnameUseCase.execute(provisionMessage.projectId, provisionMessage.subdomain);
          break;

        case 'GENERATE_SCREENSHOT':
          const screenshotMessage = message as GenerateScreenshotMessage;
          this.logger.info('Processing screenshot message', {
            buildId: screenshotMessage.buildId,
            projectId: screenshotMessage.projectId,
          });
          await this.processScreenshotUseCase.execute(screenshotMessage);
          break;

        default:
          this.logger.warn('Unknown action type', { action: (message as { action: string }).action });
          throw new Error(`Unknown action type: ${(message as { action: string }).action}`);
      }
    } else {
      // Handle regular job processing (builds)
      const jobMessage = message as JobMessage;
      console.log('[TaskController] Received job message:', JSON.stringify(jobMessage, null, 2));
      this.logger.info('Processing build job message', { buildId: jobMessage.buildId });
      await this.processJobUseCase.execute(jobMessage);
    }
  }

  private getMessageId(message: QueueMessage): string {
    if ('action' in message) {
      if (message.action === 'DELETE_MEDIA') {
        return message.mediaId;
      }
      if (message.action === 'GENERATE_SCREENSHOT') {
        return message.buildId;
      }
      return message.projectId;
    }
    return (message as JobMessage).buildId;
  }
}
