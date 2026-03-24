import { GoogleGenAI, ThinkingLevel, MediaResolution } from "@google/genai";
import { BaseAIProvider } from './BaseAIProvider';
import { AIGenerationRequest } from '../../domain/services/IAIProvider';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';

/**
 * Google Gemini API provider
 * Handles only the API communication - all business logic is in AIService
 */
export class GeminiProvider extends BaseAIProvider {
  private client: GoogleGenAI;

  constructor(aiLogRepository: IAILogRepository, apiKey?: string) {
    super(aiLogRepository);
    this.client = new GoogleGenAI({
      apiKey: apiKey || process.env.GEMINI_API_KEY,
      httpOptions: {
        timeout: 10 * 60 * 1000, // 10 minutes timeout
      },
    });
  }

  getName(): string {
    return 'gemini';
  }

  getSupportedModels(): string[] {
    return [
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash'
    ];
  }

  /**
   * Make the actual API call to Gemini
   */
  protected async callAPI(
    request: AIGenerationRequest,
    _startTime: number
  ): Promise<{ rawContent: string; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      // Build content parts with images if provided
      const contentParts = this.buildContentParts(request);
      const contents = [{ role: "user" as const, parts: contentParts }];

      // Pre-count input tokens before generation (required for thinking mode which doesn't return promptTokenCount)
      // Note: countTokens doesn't support external image URLs, so we only count text
      let preCountedInputTokens = 0;
      try {
        const textOnlyParts = contentParts.filter((p): p is { text: string } => 'text' in p);
        const contentsForCounting = [
          { role: "user" as const, parts: [{ text: request.systemPrompt }] },
          { role: "user" as const, parts: textOnlyParts }
        ];
        const countResponse = await this.client.models.countTokens({
          model: request.model,
          contents: contentsForCounting
        });
        preCountedInputTokens = countResponse.totalTokens || 0;
        // Add rough estimate for images (258 tokens per image is Gemini's default)
        const imageCount = request.mediaUrls?.length || 0;
        if (imageCount > 0) {
          preCountedInputTokens += imageCount * 258;
        }
        console.log(`[GeminiProvider] Pre-counted input tokens: ${preCountedInputTokens} (${imageCount} images estimated)`);
      } catch (countError) {
        console.warn(`[GeminiProvider] Failed to pre-count tokens:`, countError instanceof Error ? countError.message : countError);
      }

      // Configure thinking level based on model (high for pro models, low for flash)
      const isFlashModel = request.model.includes('flash');
      const thinkingLevel = isFlashModel ? ThinkingLevel.LOW : ThinkingLevel.HIGH;

      console.log("[GeminiProvider] Calling Gemini API with streaming...");
      const response = await this.client.models.generateContentStream({
        model: request.model,
        contents: contents,
        config: {
          systemInstruction: request.systemPrompt,
          maxOutputTokens: 65536,
          temperature: 1.0,
          thinkingConfig: {
            thinkingLevel: thinkingLevel
          },
          // Use high resolution for images when present
          ...(request.mediaUrls && request.mediaUrls.length > 0 && {
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH
          })
        }
      });

      // Collect streamed content
      let rawContent = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let thinkingTokens = 0;
      let chunkCount = 0;

      console.log("[GeminiProvider] Streaming API response...");
      try {
        for await (const chunk of response) {
          chunkCount++;
          if (chunk.text) {
            rawContent += chunk.text;
          }

          // Capture usage metadata - Gemini reports this in chunks (usually final chunk has complete data)
          if (chunk.usageMetadata) {
            const metadata = chunk.usageMetadata as Record<string, unknown>;

            // Standard token counts - promptTokenCount may be missing in thinking mode
            if (metadata.promptTokenCount !== undefined && metadata.promptTokenCount !== null) {
              inputTokens = metadata.promptTokenCount as number;
            }
            outputTokens = (metadata.candidatesTokenCount as number) || outputTokens;

            // Thinking tokens (when thinkingConfig is enabled)
            if (metadata.thoughtsTokenCount) {
              thinkingTokens = metadata.thoughtsTokenCount as number;
            }
          }
        }
      } catch (streamError) {
        // Log partial content info for debugging
        console.error(`[GeminiProvider] Stream error after ${chunkCount} chunks, ${rawContent.length} chars received`);
        const errorMessage = streamError instanceof Error ? streamError.message : "Unknown stream error";
        throw new Error(`Gemini API stream interrupted after ${chunkCount} chunks (${rawContent.length} chars): ${errorMessage}`);
      }

      // Use pre-counted input tokens if API didn't return promptTokenCount (happens with thinking mode)
      if (inputTokens === 0 && preCountedInputTokens > 0) {
        inputTokens = preCountedInputTokens;
        console.log(`[GeminiProvider] Using pre-counted input tokens (thinking mode doesn't return promptTokenCount)`);
      }

      // Log final token counts (include thinking tokens in output for cost tracking)
      const totalOutputTokens = outputTokens + thinkingTokens;
      console.log(`[GeminiProvider] Gemini API streaming completed - tokens: input=${inputTokens}, output=${outputTokens}, thinking=${thinkingTokens}, total_output=${totalOutputTokens}`);

      return {
        rawContent,
        // Include thinking tokens in output count for accurate cost calculation
        usage: { inputTokens, outputTokens: totalOutputTokens }
      };
    } catch (error) {
      // Check for specific error types
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // If it's already our wrapped stream error, re-throw as-is
      if (errorMessage.includes('stream interrupted')) {
        throw error;
      }

      throw new Error(`Gemini API error: ${errorMessage}`);
    }
  }

  /**
   * Build content parts array with images and text
   */
  private buildContentParts(request: AIGenerationRequest): Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> {
    const contentParts: Array<{ text: string } | { fileData: { mimeType: string; fileUri: string } }> = [];

    // Add images first if provided (Gemini expects images before text)
    if (request.mediaUrls && request.mediaUrls.length > 0) {
      for (const url of request.mediaUrls) {
        contentParts.push({
          fileData: {
            mimeType: this.getMimeTypeFromUrl(url),
            fileUri: url
          }
        });
      }
    }

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

    // Add the text prompt
    contentParts.push({ text: promptText });

    return contentParts;
  }

  /**
   * Determine MIME type from URL for media handling
   */
  private getMimeTypeFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase().split('?')[0];
    switch (extension) {
      // Images
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      // Videos
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      case 'mov':
        return 'video/quicktime';
      // Documents
      case 'pdf':
        return 'application/pdf';
      default:
        return 'image/jpeg';
    }
  }
}
