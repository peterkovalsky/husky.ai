/**
 * Request structure for AI generation
 * Contains all the information needed to make an AI request
 */
export interface AIGenerationRequest {
  /** The user's prompt/request */
  userPrompt: string;
  /** System prompt to use */
  systemPrompt: string;
  /** Current file tree content formatted for the prompt */
  fileTreeContent: string;
  /** Optional media URLs to include */
  mediaUrls?: string[];
  /** Model ID to use */
  model: string;
  /** User ID for logging */
  userId: string;
  /** Prompt ID for logging */
  promptId: string;
  /** Project ID for logging */
  projectId?: string;
  /** Build ID for logging */
  buildId?: string;
  /** Previous conversation turns for multi-turn context (user prompts + AI summaries) */
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * Response from AI provider
 */
export interface AIProviderResponse {
  /** Parsed content (JSON string with changes and fileTree) */
  content: string;
  /** Raw AI response text */
  rawContent: string;
  /** Model that was used */
  model: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Duration in milliseconds */
  durationMs: number;
  /** System prompt that was used */
  systemPrompt: string;
}

/**
 * AI Provider interface - handles only the API communication
 * All business logic (prompt building, file tree management) is external
 */
export interface IAIProvider {
  /**
   * Generate AI response for the given request
   * Provider is responsible only for:
   * - Formatting the request for the specific AI API
   * - Making the API call
   * - Parsing the response
   * - Logging execution details
   *
   * Provider is NOT responsible for:
   * - Building prompts
   * - Managing file trees
   * - Business logic decisions
   */
  generateResponse(request: AIGenerationRequest): Promise<AIProviderResponse>;

  /**
   * Get the provider name (e.g., 'anthropic', 'openai', 'gemini')
   */
  getName(): string;

  /**
   * Get the list of supported models for this provider
   */
  getSupportedModels(): string[];
}
