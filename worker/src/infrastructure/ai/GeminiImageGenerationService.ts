import { GoogleGenAI } from '@google/genai';
import { IImageGenerationService, ImageGenerationResult } from '../../domain/services/IImageGenerationService';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

const SYSTEM_PROMPT = `You are a professional image generator for websites.

Generate high-quality images based on the description provided.

Guidelines:
- Follow the style, mood, and composition described
- High resolution, clean output
- No text, watermarks, or UI elements in the image
- No distorted faces or unnatural anatomy
- Ensure the image works well as a web asset (hero, card, background, etc.)
- Use professional lighting and composition`;

/**
 * Image generation service using Google Gemini's image generation capability.
 * Uses the same @google/genai SDK and API key as the GeminiProvider for code generation.
 */
export class GeminiImageGenerationService implements IImageGenerationService {
  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for GeminiImageGenerationService');
    }

    this.client = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        timeout: TIMEOUT_MS,
      },
    });
  }

  getName(): string {
    return 'gemini-image-generation';
  }

  async generateImage(
    description: string,
    aspectRatio: string,
    model?: string
  ): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const useModel = model || DEFAULT_MODEL;

    console.log(`[GeminiImageGen] Generating image: "${description.substring(0, 80)}..." (${aspectRatio}, model: ${useModel})`);

    const response = await this.client.models.generateContent({
      model: useModel,
      contents: description,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    });

    // Extract inline image data from response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('No content parts in Gemini image generation response');
    }

    const imagePart = parts.find(
      (p) => p.inlineData
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error('No inline image data in Gemini response');
    }

    const imageData = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const durationMs = Date.now() - startTime;

    console.log(`[GeminiImageGen] Generated image: ${imageData.length} bytes, ${mimeType}, ${durationMs}ms`);

    return {
      imageData,
      mimeType,
      description,
      aspectRatio,
      model: useModel,
      durationMs,
    };
  }
}
