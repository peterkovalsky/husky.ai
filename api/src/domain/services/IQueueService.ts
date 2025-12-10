export interface JobMessage {
  buildId: string;  // Only buildId needed - all other data is in the build record
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

export interface ProvisionHostnameMessage {
  action: 'PROVISION_HOSTNAME';
  projectId: string;
  subdomain: string;
  timestamp: string;
}

export type QueueMessage = JobMessage | DeleteProjectMessage | DeleteMediaMessage | PublishProjectMessage | UnpublishProjectMessage | ProvisionHostnameMessage;

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