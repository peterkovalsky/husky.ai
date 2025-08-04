import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { IQueueService, QueueMessage, ReceiveMessageResult } from '../../domain/services/IQueueService';

export class SQSQueueService implements IQueueService {
  private sqsClient: SQSClient;
  private queueUrl: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    this.queueUrl = process.env.SQS_QUEUE_URL!;

    if (!this.queueUrl) {
      throw new Error('Missing SQS configuration: SQS_QUEUE_URL is required');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(`Missing AWS credentials: AWS_ACCESS_KEY_ID=${!!accessKeyId}, AWS_SECRET_ACCESS_KEY=${!!secretAccessKey}`);
    }

    this.sqsClient = new SQSClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log(`SQSQueueService initialized with region: ${region}, queue: ${this.queueUrl}`);
  }

  async sendMessage(message: QueueMessage): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(message),
    });

    await this.sqsClient.send(command);
  }

  async receiveMessages(maxMessages: number = 1): Promise<ReceiveMessageResult> {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20, // Long polling
    });

    const result = await this.sqsClient.send(command);
    
    const messages = (result.Messages || []).map(msg => ({
      body: JSON.parse(msg.Body!) as QueueMessage,
      receiptHandle: msg.ReceiptHandle!
    }));

    return { messages };
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await this.sqsClient.send(command);
  }
}