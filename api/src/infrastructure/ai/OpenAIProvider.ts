import OpenAI from 'openai';
import { BaseAIProvider } from './BaseAIProvider';
import { AIGenerationRequest } from '../../domain/services/IAIProvider';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';

/**
 * OpenAI GPT API provider using the Responses API
 * Uses built-in web_search tool for server-side URL fetching and web search
 */
export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(aiLogRepository: IAILogRepository, apiKey?: string) {
    super(aiLogRepository);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      timeout: 10 * 60 * 1000, // 10 minutes timeout
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
   * Make the actual API call to OpenAI using the Responses API
   */
  protected async callAPI(
    request: AIGenerationRequest,
    _startTime: number
  ): Promise<{ rawContent: string; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      // Build user content with images if provided
      const userContent = this.buildUserContent(request);

      console.log("[OpenAIProvider] Calling OpenAI Responses API with streaming...");
      const stream = await this.client.responses.create({
        model: request.model,
        max_output_tokens: 32768,
        instructions: request.systemPrompt,
        input: [
          {
            role: "user",
            content: userContent
          }
        ],
        tools: [
          {
            type: "web_search",
          }
        ],
        stream: true
      });

      // Collect streamed content
      let rawContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      console.log("[OpenAIProvider] Streaming API response...");
      for await (const event of stream) {
        // Text deltas contain the actual generated content
        if (event.type === 'response.output_text.delta') {
          rawContent += event.delta;
        }

        // Usage data comes in the completed event
        if (event.type === 'response.completed') {
          const usage = event.response.usage;
          if (usage) {
            inputTokens = usage.input_tokens;
            outputTokens = usage.output_tokens;
          }
        }
      }

      console.log("[OpenAIProvider] OpenAI Responses API streaming completed");

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
   * Build user content array with media (images/videos) and text for the Responses API
   */
  private buildUserContent(request: AIGenerationRequest): string | OpenAI.Responses.ResponseInputContent[] {
    // Build the full prompt text
    let promptText = `Current app:
${request.fileTreeContent}

Request:
${request.userPrompt}`;

    // Add media URLs explicitly to the text prompt
    if (request.mediaUrls && request.mediaUrls.length > 0) {
      promptText += `

UPLOADED MEDIA TO USE (You can see these files above):
${request.mediaUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

IMPORTANT: When the request mentions uploaded images or videos, use the EXACT URLs listed above. DO NOT use stock photos or other URLs.`;
    }

    // If no media, return just the text
    if (!request.mediaUrls || request.mediaUrls.length === 0) {
      return promptText;
    }

    // Build content array with media first, then text
    const content: OpenAI.Responses.ResponseInputContent[] = [];

    request.mediaUrls.forEach(url => {
      const isVideo = this.isVideoUrl(url);
      if (isVideo) {
        // Videos use input_file type with file_url
        content.push({
          type: "input_file",
          file_url: url
        });
      } else {
        // Images use input_image type with image_url
        content.push({
          type: "input_image",
          image_url: url,
          detail: "auto" as const
        });
      }
    });

    // Add text
    content.push({
      type: "input_text",
      text: promptText
    });

    return content;
  }

  /**
   * Check if URL points to a video file
   */
  private isVideoUrl(url: string): boolean {
    const extension = url.split('.').pop()?.toLowerCase().split('?')[0];
    return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension || '');
  }
}
