export interface AILog {
  id: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  projectId: string;
  buildId?: string;
  userId: string;
  prompt: string;
  systemPrompt: string;
  aiResponse?: string;
  conversationHistory?: { role: string; content: string }[];
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateAILogRequest {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  projectId?: string;
  buildId?: string;
  userId: string;
  prompt: string;
  systemPrompt: string;
  aiResponse?: string;
  conversationHistory?: { role: string; content: string }[];
}
