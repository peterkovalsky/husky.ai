export interface JobMessage {
  promptId: string;
  jobId?: string; // for backward compatibility
  prompt: string;
  projectId: string;
  userId: string;
  timestamp: string;
}

export interface ReceiveMessageResult {
  messages: Array<{
    body: JobMessage;
    receiptHandle: string;
  }>;
}

export interface IQueueService {
  sendMessage(message: JobMessage): Promise<void>;
  receiveMessages(maxMessages?: number): Promise<ReceiveMessageResult>;
  deleteMessage(receiptHandle: string): Promise<void>;
}