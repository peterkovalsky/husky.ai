export interface AIResponse {
  content: string;
  rawContent: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface IAIService {
  /**
   * Generate AI response using the specified model
   * @param prompt - User prompt
   * @param promptId - ID of the prompt in database
   * @param model - Model ID to use (e.g., 'gemini-3.1-pro-preview', 'claude-sonnet-4-6')
   * @param mediaUrls - Optional array of media URLs (images)
   */
  generateResponse(prompt: string, promptId: string, model: string, mediaUrls?: string[]): Promise<AIResponse>;
  setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void>;
  getCurrentFileTree(): Record<string, string>;
}