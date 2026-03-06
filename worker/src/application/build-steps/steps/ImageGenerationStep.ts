import { randomUUID } from 'crypto';
import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IImageGenerationService } from '../../../domain/services/IImageGenerationService';
import { IPublicMediaStorageService } from '../../../domain/services/IPublicMediaStorageService';
import { FileTree } from '../../../domain/entities/Build';

const MARKER_REGEX = /\[\[GENERATE_IMAGE:(\d+:\d+):(.+?)\]\]/g;

interface MarkerMatch {
  fullMarker: string;
  aspectRatio: string;
  description: string;
}

/**
 * ImageGenerationStep: Scans file tree for image generation markers,
 * generates images via AI, uploads to R2, and replaces markers with URLs.
 *
 * This step is non-fatal: if image generation fails, markers are replaced
 * with placehold.co fallback URLs and the build continues.
 */
export class ImageGenerationStep implements IBuildStep {
  readonly stepName = 'Image Generation';
  readonly stepStatus = BuildStepStatus.GENERATING_IMAGES;

  constructor(
    private buildRepository: IBuildRepository,
    private imageGenerationService: IImageGenerationService,
    private publicMediaStorageService: IPublicMediaStorageService,
    private maxImagesPerBuild: number,
    private concurrency: number,
    private model?: string
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const fileTree = context.fileTree;
      if (!fileTree) {
        console.log(`[${this.stepName}] No file tree in context, skipping`);
        return { success: true };
      }

      // Scan for markers across all files
      const allMarkers = this.scanForMarkers(fileTree);

      if (allMarkers.length === 0) {
        console.log(`[${this.stepName}] No image generation markers found, skipping`);
        return { success: true };
      }

      // Update status
      await this.buildRepository.updateStatus(context.buildId, this.stepStatus);

      // Deduplicate: same aspectRatio + description = same image
      const uniqueMarkers = this.deduplicateMarkers(allMarkers);

      console.log(`[${this.stepName}] Found ${allMarkers.length} markers (${uniqueMarkers.length} unique) across file tree`);

      // Cap at max images
      const markersToProcess = uniqueMarkers.slice(0, this.maxImagesPerBuild);
      if (uniqueMarkers.length > this.maxImagesPerBuild) {
        console.warn(`[${this.stepName}] Capping at ${this.maxImagesPerBuild} images (found ${uniqueMarkers.length})`);
      }

      // Generate images with concurrency limit
      const markerToUrl = await this.generateImages(markersToProcess, context.projectId);

      // Replace markers in file tree
      this.replaceMarkers(fileTree, markerToUrl);

      const duration = Date.now() - startTime;
      const generated = Object.values(markerToUrl).filter(url => !url.includes('placehold.co')).length;
      const fallbacks = markersToProcess.length - generated;

      console.log(`[${this.stepName}] Completed in ${duration}ms: ${generated} generated, ${fallbacks} fallbacks`);

      return {
        success: true,
        metrics: {
          imageGenerationTimeMs: duration,
          imagesGenerated: generated,
          imagesFallback: fallbacks,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Unexpected error after ${duration}ms:`, error);

      // Even on unexpected errors, try to replace all markers with fallbacks
      // so the build can continue
      try {
        if (context.fileTree) {
          this.replaceAllWithFallbacks(context.fileTree);
        }
      } catch (fallbackError) {
        console.error(`[${this.stepName}] Failed to apply fallbacks:`, fallbackError);
      }

      // Non-fatal: return success so the build continues
      return {
        success: true,
        metrics: { imageGenerationTimeMs: duration },
      };
    }
  }

  /**
   * Scan all files in the file tree for GENERATE_IMAGE markers
   */
  private scanForMarkers(fileTree: FileTree): MarkerMatch[] {
    const markers: MarkerMatch[] = [];

    for (const [, content] of Object.entries(fileTree)) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags);
      while ((match = regex.exec(content)) !== null) {
        markers.push({
          fullMarker: match[0],
          aspectRatio: match[1],
          description: match[2],
        });
      }
    }

    return markers;
  }

  /**
   * Deduplicate markers by aspectRatio + description
   */
  private deduplicateMarkers(markers: MarkerMatch[]): MarkerMatch[] {
    const seen = new Set<string>();
    const unique: MarkerMatch[] = [];

    for (const marker of markers) {
      const key = `${marker.aspectRatio}:${marker.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(marker);
      }
    }

    return unique;
  }

  /**
   * Generate images with concurrency limit, returning a map of marker -> URL
   */
  private async generateImages(
    markers: MarkerMatch[],
    projectId: string
  ): Promise<Record<string, string>> {
    const markerToUrl: Record<string, string> = {};

    // Process in batches of `concurrency`
    for (let i = 0; i < markers.length; i += this.concurrency) {
      const batch = markers.slice(i, i + this.concurrency);
      const results = await Promise.allSettled(
        batch.map(marker => this.generateAndUpload(marker, projectId))
      );

      for (let j = 0; j < batch.length; j++) {
        const marker = batch[j];
        const result = results[j];

        if (result.status === 'fulfilled') {
          markerToUrl[marker.fullMarker] = result.value;
        } else {
          console.warn(
            `[${this.stepName}] Failed to generate image for "${marker.description.substring(0, 60)}...": ${result.reason}`
          );
          markerToUrl[marker.fullMarker] = this.getFallbackUrl(marker.aspectRatio);
        }
      }
    }

    return markerToUrl;
  }

  /**
   * Generate a single image and upload to R2
   */
  private async generateAndUpload(marker: MarkerMatch, projectId: string): Promise<string> {
    const result = await this.imageGenerationService.generateImage(
      marker.description,
      marker.aspectRatio,
      this.model
    );

    const filename = `generated-${randomUUID()}.png`;
    const { publicUrl } = await this.publicMediaStorageService.uploadBuffer(
      result.imageData,
      projectId,
      filename,
      result.mimeType
    );

    return publicUrl;
  }

  /**
   * Replace all markers in the file tree with their resolved URLs
   */
  private replaceMarkers(fileTree: FileTree, markerToUrl: Record<string, string>): void {
    for (const [filePath, content] of Object.entries(fileTree)) {
      let updatedContent = content;
      for (const [marker, url] of Object.entries(markerToUrl)) {
        updatedContent = updatedContent.split(marker).join(url);
      }

      // Also replace any remaining unresolved markers with fallbacks
      updatedContent = updatedContent.replace(MARKER_REGEX, (_match, aspectRatio: string) => {
        return this.getFallbackUrl(aspectRatio);
      });

      if (updatedContent !== content) {
        fileTree[filePath] = updatedContent;
      }
    }
  }

  /**
   * Replace all markers in file tree with fallback placeholders
   */
  private replaceAllWithFallbacks(fileTree: FileTree): void {
    for (const [filePath, content] of Object.entries(fileTree)) {
      const updatedContent = content.replace(MARKER_REGEX, (_match, aspectRatio: string) => {
        return this.getFallbackUrl(aspectRatio);
      });

      if (updatedContent !== content) {
        fileTree[filePath] = updatedContent;
      }
    }
  }

  /**
   * Get a placehold.co fallback URL for a given aspect ratio
   */
  private getFallbackUrl(aspectRatio: string): string {
    const [w, h] = aspectRatio.split(':').map(Number);
    // Scale to reasonable pixel dimensions
    const baseSize = 600;
    const width = Math.round(baseSize * (w / Math.min(w, h)));
    const height = Math.round(baseSize * (h / Math.min(w, h)));
    return `https://placehold.co/${width}x${height}`;
  }
}
