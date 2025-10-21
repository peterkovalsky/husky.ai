export interface Prompt {
  id: string;
  prompt: string;
  projectId: string;
  userId: string;
  buildId?: string;
  rawAiResponse?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  model?: string;
  costUsd?: number;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreatePromptRequest {
  prompt: string;
  projectId: string;
  userId: string;
}