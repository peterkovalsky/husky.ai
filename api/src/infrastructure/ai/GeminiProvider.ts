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
      'gemini-3-pro-preview',
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

      // Configure thinking level based on model (high for pro models, low for flash)
      const isFlashModel = request.model.includes('flash');
      const thinkingLevel = isFlashModel ? ThinkingLevel.LOW : ThinkingLevel.HIGH;

      console.log("[GeminiProvider] Calling Gemini API with streaming...");
      const response = await this.client.models.generateContentStream({
        model: request.model,
        contents: [{ role: "user", parts: contentParts }],
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
      let chunkCount = 0;

      console.log("[GeminiProvider] Streaming API response...");
      try {
        for await (const chunk of response) {
          chunkCount++;
          if (chunk.text) {
            rawContent += chunk.text;
          }

          if (chunk.usageMetadata) {
            inputTokens = chunk.usageMetadata.promptTokenCount || 0;
            outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
          }
        }
      } catch (streamError) {
        // Log partial content info for debugging
        console.error(`[GeminiProvider] Stream error after ${chunkCount} chunks, ${rawContent.length} chars received`);
        const errorMessage = streamError instanceof Error ? streamError.message : "Unknown stream error";
        throw new Error(`Gemini API stream interrupted after ${chunkCount} chunks (${rawContent.length} chars): ${errorMessage}`);
      }

      console.log("[GeminiProvider] Gemini API streaming completed");

      return {
        rawContent,
        usage: { inputTokens, outputTokens }
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
