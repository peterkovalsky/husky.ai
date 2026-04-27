import { IQueueService, QueueMessage, ReceiveMessageResult } from '../../domain/services/IQueueService';

/**
 * Local-dev queue that POSTs messages directly to the worker over HTTP,
 * skipping Cloud Tasks. Eliminates the need for a public tunnel (ngrok)
 * because the worker is reached at WORKER_URL (e.g. http://localhost:3334).
 *
 * Fire-and-forget: matches Cloud Tasks async semantics. The HTTP call is
 * dispatched without awaiting the worker's full processing time.
 */
export class DirectHttpQueueService implements IQueueService {
  private workerUrl: string;

  constructor() {
    this.workerUrl = process.env.WORKER_URL || '';

    if (!this.workerUrl) {
      throw new Error('Missing DirectHttpQueueService configuration: WORKER_URL is required');
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('DirectHttpQueueService is for local dev only and must not run in production');
    }

    console.log(`DirectHttpQueueService initialized with worker: ${this.workerUrl}`);
  }

  async sendMessage(message: QueueMessage): Promise<void> {
    const taskEndpoint = `${this.workerUrl}/tasks/process`;
    const messageType = 'action' in message ? message.action : 'BUILD';

    // Fire-and-forget so the API request returns immediately, mirroring
    // the async push semantics of Cloud Tasks. Errors are logged but not
    // surfaced to the caller — the worker is responsible for retries/state.
    fetch(taskEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.error(`[DirectHttp] Worker returned ${response.status} for ${messageType}: ${text}`);
        } else {
          console.log(`[DirectHttp] Dispatched ${messageType} to worker`);
        }
      })
      .catch((err) => {
        console.error(`[DirectHttp] Failed to dispatch ${messageType} to worker:`, err);
      });
  }

  async receiveMessages(_maxMessages?: number): Promise<ReceiveMessageResult> {
    throw new Error('receiveMessages is not supported in DirectHttp mode. Worker receives via HTTP push.');
  }

  async deleteMessage(_receiptHandle: string): Promise<void> {
    // No-op — push model, no acknowledgement queue to manage.
  }
}
