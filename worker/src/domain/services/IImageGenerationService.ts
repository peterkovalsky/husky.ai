export interface ImageGenerationResult {
  imageData: Buffer;
  mimeType: string;
  description: string;
  aspectRatio: string;
  model: string;
  durationMs: number;
}

export interface IImageGenerationService {
  generateImage(description: string, aspectRatio: string, model?: string): Promise<ImageGenerationResult>;
  getName(): string;
}
