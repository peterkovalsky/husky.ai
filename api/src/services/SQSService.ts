import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

export interface JobMessage {
  jobId: string;
  prompt: string;
  timestamp: string;
  promptId?: string; // New field for database integration
  projectId?: string; // Project context
  userId?: string; // User context
}

export class SQSService {
  private client: SQSClient;
  private queueUrl: string;

  constructor(queueUrl?: string) {
    this.client = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      }
    });
    
    this.queueUrl = queueUrl || process.env.SQS_QUEUE_URL || '';
    
    if (!this.queueUrl) {
      throw new Error('SQS Queue URL is required. Set SQS_QUEUE_URL environment variable.');
    }
  }

  async sendMessage(jobMessage: JobMessage): Promise<string | undefined> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(jobMessage),
        MessageAttributes: {
          JobId: {
            DataType: 'String',
            StringValue: jobMessage.jobId
          },
          Timestamp: {
            DataType: 'String',
            StringValue: jobMessage.timestamp
          }
        }
      });

      const response = await this.client.send(command);
      return response.MessageId;
    } catch (error) {
      console.error('Error sending message to SQS:', error);
      throw new Error(`Failed to send message to SQS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async receiveMessages(maxMessages: number = 1): Promise<{
    messages: Array<{
      messageId: string;
      receiptHandle: string;
      body: JobMessage;
    }>;
  }> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: 10, // Long polling
        MessageAttributeNames: ['All']
      });

      const response = await this.client.send(command);
      
      const messages = (response.Messages || []).map(message => ({
        messageId: message.MessageId!,
        receiptHandle: message.ReceiptHandle!,
        body: JSON.parse(message.Body!) as JobMessage
      }));

      return { messages };
    } catch (error) {
      console.error('Error receiving messages from SQS:', error);
      throw new Error(`Failed to receive messages from SQS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error deleting message from SQS:', error);
      throw new Error(`Failed to delete message from SQS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}