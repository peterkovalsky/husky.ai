export interface JobMessage {
  promptId: string;
  jobId?: string; // for backward compatibility
  prompt: string;
  projectId: string;
  userId: string;
  mediaIds?: string[];
  timestamp: string;
}

export interface DeleteProjectMessage {
  action: 'DELETE_PROJECT';
  projectId: string;
  userId: string;
  timestamp: string;
}

export interface DeleteMediaMessage {
  action: 'DELETE_MEDIA';
  mediaId: string;
  userId: string;
  projectId?: string; // Optional: if provided, only clean from this project's builds
  timestamp: string;
}

export interface PublishProjectMessage {
  action: 'PUBLISH';
  projectId: string;
  userId: string;
  timestamp: string;
}

export interface UnpublishProjectMessage {
  action: 'UNPUBLISH';
  projectId: string;
  userId: string;
  timestamp: string;
}

export type QueueMessage = JobMessage | DeleteProjectMessage | DeleteMediaMessage | PublishProjectMessage | UnpublishProjectMessage;

export interface ReceiveMessageResult {
  messages: Array<{
    body: QueueMessage;
    receiptHandle: string;
  }>;
}

export interface IQueueService {
  sendMessage(message: QueueMessage): Promise<void>;
  receiveMessages(maxMessages?: number): Promise<ReceiveMessageResult>;
  deleteMessage(receiptHandle: string): Promise<void>;
}