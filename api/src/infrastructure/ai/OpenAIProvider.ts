import OpenAI from 'openai';
import { BaseAIProvider } from './BaseAIProvider';
import { AIGenerationRequest } from '../../domain/services/IAIProvider';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';

/**
 * OpenAI GPT API provider
 * Handles only the API communication - all business logic is in AIService
 */
export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(aiLogRepository: IAILogRepository, apiKey?: string) {
    super(aiLogRepository);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      timeout: 20 * 60 * 1000, // 20 minutes timeout
    });
  }

  getName(): string {
    return 'openai';
  }

  getSupportedModels(): string[] {
    return [
      'gpt-5.1',
      'gpt-5.1-chat-latest'
    ];
  }

  /**
   * Make the actual API call to OpenAI
   */
  protected async callAPI(
    request: AIGenerationRequest,
    _startTime: number
  ): Promise<{ rawContent: string; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      // Build user content with images if provided
      const userContent = this.buildUserContent(request);

      // Define tools for web search and web fetch
      const tools: OpenAI.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web for current information, trends, and best practices. Use when user explicitly needs current/external info.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query"
                }
              },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "web_fetch",
            description: "Fetch content from a URL or PDF. Use when user needs external API docs or specific web content.",
            parameters: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL to fetch content from"
                }
              },
              required: ["url"]
            }
          }
        }
      ];

      console.log("[OpenAIProvider] Calling OpenAI API with streaming...");
      const stream = await this.client.chat.completions.create({
        model: request.model,
        max_tokens: 32768,
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: userContent as any
          }
        ],
        tools,
        stream: true,
        stream_options: { include_usage: true }
      });

      // Collect streamed content
      let rawContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      console.log("[OpenAIProvider] Streaming API response...");
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          rawContent += delta.content;
        }

        // Usage data comes in final chunks
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      console.log("[OpenAIProvider] OpenAI API streaming completed");

      return {
        rawContent,
        usage: { inputTokens, outputTokens }
      };
    } catch (error) {
      if (error instanceof OpenAI.RateLimitError) {
        throw new Error(`OpenAI rate limit exceeded: ${error.message}`);
      }
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Build user content array with images and text
   */
  private buildUserContent(request: AIGenerationRequest): Array<{ type: string; text?: string; image_url?: { url: string } }> {
    // Build the full prompt text
    let promptText = `Current app:
${request.fileTreeContent}

Request:
${request.userPrompt}`;

    // Add image URLs explicitly to the text prompt
    if (request.mediaUrls && request.mediaUrls.length > 0) {
      promptText += `

UPLOADED IMAGES TO USE (You can see these images above):
${request.mediaUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

IMPORTANT: When the request mentions "this image" or "these images", use the EXACT URLs listed above. DO NOT use stock photos or other URLs.`;
    }

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Add images first if provided
    if (request.mediaUrls && request.mediaUrls.length > 0) {
      request.mediaUrls.forEach(url => {
        content.push({
          type: "image_url",
          image_url: { url }
        });
      });
    }

    // Add text
    content.push({
      type: "text",
      text: promptText
    });

    return content;
  }
}
