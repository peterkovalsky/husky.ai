export interface AIProviderResponse {
  content: string;
  rawContent: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  durationMs: number;
  systemPrompt: string;
}

export interface IAIProvider {
  /**
   * Generate AI response for the given prompt
   * @param userRequest - User's prompt/request
   * @param promptId - ID of the prompt in the database
   * @param userId - User ID for logging purposes
   * @param useHaiku - Whether to use faster/cheaper model variant
   * @param mediaUrls - Optional array of media URLs (images) to include
   * @returns AI response with content, tokens, and metadata
   */
  generateResponse(
    userRequest: string,
    promptId: string,
    userId: string,
    useHaiku?: boolean,
    mediaUrls?: string[]
  ): Promise<AIProviderResponse>;

  /**
   * Set the project context for subsequent generations
   * @param projectId - Project ID
   * @param fileTree - Current file tree as key-value pairs
   * @param buildId - Optional build ID
   */
  setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void>;

  /**
   * Get the current file tree from the provider's state
   * @returns Current file tree as key-value pairs
   */
  getCurrentFileTree(): Record<string, string>;

  /**
   * Get the provider name (e.g., 'anthropic', 'openai')
   * @returns Provider name
   */
  getName(): string;

  /**
   * Get the list of supported models for this provider
   * @returns Array of model identifiers
   */
  getSupportedModels(): string[];
}
