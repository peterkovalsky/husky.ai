import { CloudTasksClient } from '@google-cloud/tasks';
import { IQueueService, QueueMessage, ReceiveMessageResult } from '../../domain/services/IQueueService';

export class CloudTasksQueueService implements IQueueService {
  private client: CloudTasksClient;
  private queuePath: string;
  private workerUrl: string;
  private serviceAccountEmail: string;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-east1';
    const queueId = process.env.CLOUD_TASKS_QUEUE_ID || 'husky-jobs';
    this.workerUrl = process.env.WORKER_URL || '';
    this.serviceAccountEmail = process.env.CLOUD_TASKS_SERVICE_ACCOUNT || '';

    if (!projectId) {
      throw new Error('Missing Cloud Tasks configuration: GCP_PROJECT_ID is required');
    }

    if (!this.workerUrl) {
      throw new Error('Missing Cloud Tasks configuration: WORKER_URL is required');
    }

    if (!this.serviceAccountEmail) {
      throw new Error('Missing Cloud Tasks configuration: CLOUD_TASKS_SERVICE_ACCOUNT is required');
    }

    this.client = new CloudTasksClient();
    this.queuePath = this.client.queuePath(projectId, location, queueId);

    console.log(`CloudTasksQueueService initialized with queue: ${this.queuePath}, worker: ${this.workerUrl}`);
  }

  async sendMessage(message: QueueMessage): Promise<void> {
    const taskEndpoint = `${this.workerUrl}/tasks/process`;

    // Determine dispatch deadline based on message type
    // Build jobs can take up to 15 minutes, screenshots up to 2 minutes
    let dispatchDeadlineSeconds = 900; // 15 minutes default for builds

    if ('action' in message) {
      switch (message.action) {
        case 'GENERATE_SCREENSHOT':
          dispatchDeadlineSeconds = 120; // 2 minutes
          break;
        case 'DELETE_PROJECT':
        case 'DELETE_MEDIA':
        case 'UNPUBLISH':
          dispatchDeadlineSeconds = 300; // 5 minutes
          break;
        case 'PUBLISH':
        case 'PROVISION_HOSTNAME':
          dispatchDeadlineSeconds = 600; // 10 minutes
          break;
      }
    }

    const task = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: taskEndpoint,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(message)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: this.serviceAccountEmail,
          audience: this.workerUrl,
        },
      },
      dispatchDeadline: {
        seconds: dispatchDeadlineSeconds,
      },
    };

    const [response] = await this.client.createTask({
      parent: this.queuePath,
      task,
    });

    console.log(`[CloudTasks] Created task: ${response.name}`);
  }

  async receiveMessages(_maxMessages?: number): Promise<ReceiveMessageResult> {
    // Cloud Tasks is push-based, so receiveMessages is not used
    // This method is only here to satisfy the interface
    throw new Error('receiveMessages is not supported in Cloud Tasks push model. Tasks are pushed to the worker via HTTP.');
  }

  async deleteMessage(_receiptHandle: string): Promise<void> {
    // In Cloud Tasks push model, tasks are automatically deleted when the worker returns 2xx
    // This method is a no-op to satisfy the interface
    console.log('[CloudTasks] deleteMessage called - no-op in push model (task auto-deleted on success)');
  }
}
