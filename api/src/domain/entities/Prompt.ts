export interface Prompt {
  id: string;
  prompt: string;
  projectId: string;
  userId: string;
  buildId?: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreatePromptRequest {
  prompt: string;
  projectId: string;
  userId: string;
}