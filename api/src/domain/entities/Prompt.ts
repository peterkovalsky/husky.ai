export type PromptStatus = 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';

export interface Prompt {
  id: string;
  prompt: string;
  status: PromptStatus;
  projectId: string;
  userId: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreatePromptRequest {
  prompt: string;
  projectId: string;
  userId: string;
}