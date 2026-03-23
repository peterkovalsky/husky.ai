import sharp from 'sharp';
import { getPostHogErrorTracker } from '../monitoring/PostHogErrorTracker';

export interface IScreenshotService {
  captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer>;
  shutdown(): Promise<void>;
}

export class ScreenshotService implements IScreenshotService {
  private readonly viewportWidth = 1280;
  private readonly viewportHeight = 720;
  private readonly thumbnailWidth = 480;
  private readonly requestTimeout = 30000; // 30 seconds

  private readonly accountId: string;
  private readonly apiToken: string;

  constructor() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
    }
    if (!apiToken) {
      throw new Error('CLOUDFLARE_API_TOKEN environment variable is required');
    }

    this.accountId = accountId;
    this.apiToken = apiToken;
  }

  async shutdown(): Promise<void> {
    // No-op: no local browser to clean up
  }

  async captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[ScreenshotService] Retry attempt ${attempt}/${maxRetries} for ${url}`);
        } else {
          console.log(`[ScreenshotService] Capturing screenshot of ${url}`);
        }

        const rawBuffer = await this.fetchScreenshot(url);
        console.log(`[ScreenshotService] Raw screenshot captured (${rawBuffer.length} bytes)`);

        // Resize using Sharp, keep as PNG
        const compressedBuffer = await sharp(rawBuffer)
          .resize(this.thumbnailWidth, null, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png({
            compressionLevel: 9,
          })
          .toBuffer();

        console.log(`[ScreenshotService] Screenshot compressed (${rawBuffer.length} -> ${compressedBuffer.length} bytes, ${Math.round((1 - compressedBuffer.length / rawBuffer.length) * 100)}% reduction)`);

        return compressedBuffer;

      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
        } else {
          const errorMessage = (error as any)?.message || (error as any)?.error || JSON.stringify(error);
          lastError = new Error(`Screenshot error: ${errorMessage}`);
        }

        const isRetryable = this.isRetryableError(lastError);

        if (isRetryable && attempt < maxRetries) {
          console.warn(`[ScreenshotService] Retryable error, will retry: ${lastError.message}`);
          continue;
        }

        console.error(`[ScreenshotService] Failed to capture screenshot: ${lastError.message}`);

        try {
          const posthog = getPostHogErrorTracker();
          await posthog.captureException(lastError, {
            projectId: context?.projectId,
            userId: context?.userId,
            screenshotUrl: url,
            component: 'ScreenshotService',
            retryAttempt: attempt,
            isRetryable,
          });
        } catch (posthogError) {
          console.warn('[ScreenshotService] Failed to log error to PostHog:', posthogError);
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Screenshot capture failed after retries');
  }

  private async fetchScreenshot(url: string): Promise<Buffer> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering/screenshot`;

    const headers: Record<string, string> = {};
    const screenshotSecret = process.env.PREVIEW_SCREENSHOT_SECRET;
    if (screenshotSecret) {
      headers['X-Screenshot-Key'] = screenshotSecret;
    }

    const body = {
      url,
      viewport: {
        width: this.viewportWidth,
        height: this.viewportHeight,
        deviceScaleFactor: 1,
      },
      gotoOptions: {
        waitUntil: 'load',
        timeout: this.requestTimeout,
      },
      setExtraHTTPHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeout + 5000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`Cloudflare Browser Rendering API error ${response.status}: ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message;
    return (
      message.includes('429') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('abort') ||
      message.includes('timeout') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNRESET')
    );
  }
}
