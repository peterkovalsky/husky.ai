export interface AIResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface IAIService {
  generateResponse(prompt: string, promptId?: string): Promise<AIResponse>;
  setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void>;
  getCurrentFileTree(): Record<string, string>;
}