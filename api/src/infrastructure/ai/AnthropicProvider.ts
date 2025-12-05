import Anthropic from "@anthropic-ai/sdk";
import { BaseAIProvider } from './BaseAIProvider';
import { AIGenerationRequest } from '../../domain/services/IAIProvider';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';

/**
 * Anthropic Claude API provider
 * Handles only the API communication - all business logic is in AIService
 */
export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;

  constructor(aiLogRepository: IAILogRepository, apiKey?: string) {
    super(aiLogRepository);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      timeout: 20 * 60 * 1000, // 20 minutes timeout
    });
  }

  getName(): string {
    return 'anthropic';
  }

  getSupportedModels(): string[] {
    return [
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001'
    ];
  }

  /**
   * Make the actual API call to Anthropic
   */
  protected async callAPI(
    request: AIGenerationRequest,
    _startTime: number
  ): Promise<{ rawContent: string; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      // Build user content with images if provided
      const userContent = this.buildUserContent(request);

      console.log("[AnthropicProvider] Calling Anthropic API with streaming...");
      const stream = await this.client.messages.stream({
        model: request.model,
        max_tokens: 32768,
        system: request.systemPrompt,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 10
          },
          {
            type: "web_fetch_20250910",
            name: "web_fetch",
            max_uses: 5,
            citations: { enabled: true },
            max_content_tokens: 100000
          }
        ]
      } as any, {
        headers: {
          "anthropic-beta": "web-fetch-2025-09-10"
        }
      });

      // Collect streamed content
      let rawContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      console.log("[AnthropicProvider] Streaming API response...");
      for await (const chunk of stream) {
        if (chunk.type === 'message_start') {
          inputTokens = chunk.message.usage.input_tokens;
        } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          rawContent += chunk.delta.text;
        } else if (chunk.type === 'message_delta') {
          outputTokens = chunk.usage.output_tokens;
        }
      }

      console.log("[AnthropicProvider] Anthropic API streaming completed");

      return {
        rawContent,
        usage: { inputTokens, outputTokens }
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Build user content array with images and text
   */
  private buildUserContent(request: AIGenerationRequest): string | Array<{ type: string; text?: string; source?: { type: string; url: string } }> {
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

    // If no images, return just the text
    if (!request.mediaUrls || request.mediaUrls.length === 0) {
      return promptText;
    }

    // Build content array with images first, then text
    return [
      ...request.mediaUrls.map(url => ({
        type: "image" as const,
        source: {
          type: "url" as const,
          url
        }
      })),
      {
        type: "text" as const,
        text: promptText
      }
    ];
  }
}
