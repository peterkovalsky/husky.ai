import puppeteer, { Browser } from 'puppeteer';
import sharp from 'sharp';
import { getPostHogErrorTracker } from '../monitoring/PostHogErrorTracker';

export interface IScreenshotService {
  captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer>;
  shutdown(): Promise<void>;
}

export class ScreenshotService implements IScreenshotService {
  private readonly width = 1280;
  private readonly height = 720;
  private readonly pageLoadTimeout = 30000; // 30 seconds
  private readonly thumbnailWidth = 480; // Resize for thumbnails

  // Browser pooling - reuse browser instance across screenshots
  private static browser: Browser | null = null;
  private static browserLastUsed: number = 0;
  private static readonly BROWSER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  /**
   * Get or create a browser instance (pooled)
   */
  private async getBrowser(): Promise<Browser> {
    // Check if existing browser is still valid
    if (ScreenshotService.browser) {
      try {
        // Test if browser is still connected
        const pages = await ScreenshotService.browser.pages();
        if (pages) {
          ScreenshotService.browserLastUsed = Date.now();
          return ScreenshotService.browser;
        }
      } catch {
        // Browser disconnected, will create new one
        ScreenshotService.browser = null;
      }
    }

    console.log('[ScreenshotService] Launching new browser instance...');
    const isDev = process.env.NODE_ENV !== 'production';

    ScreenshotService.browser = await puppeteer.launch({
      headless: isDev ? 'shell' : true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-features=HttpsUpgrades,HttpsFirstModeV2,HttpsFirstModeForTypedNavigations,HttpsOnlyMode',
        '--disable-blink-features=AutomationControlled',
        '--user-data-dir=/tmp/chromium-user-data',
      ],
      protocolTimeout: 30000,
    });

    ScreenshotService.browserLastUsed = Date.now();
    console.log('[ScreenshotService] Browser launched successfully');
    return ScreenshotService.browser;
  }

  /**
   * Shutdown the browser instance (for graceful shutdown)
   */
  async shutdown(): Promise<void> {
    if (ScreenshotService.browser) {
      try {
        await ScreenshotService.browser.close();
        ScreenshotService.browser = null;
        console.log('[ScreenshotService] Browser closed');
      } catch (error) {
        console.warn('[ScreenshotService] Error closing browser:', error);
      }
    }
  }

  /**
   * Captures a screenshot of the given URL
   * @param url The URL to capture
   * @param context Optional context for error tracking
   * @returns Buffer containing the PNG screenshot
   */
  async captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let page: Awaited<ReturnType<Browser['newPage']>> | null = null;

      try {
        if (attempt > 0) {
          console.log(`[ScreenshotService] Retry attempt ${attempt}/${maxRetries} for ${url}`);
        } else {
          console.log(`[ScreenshotService] Capturing screenshot of ${url}`);
        }

        // Get pooled browser instance
        const browser = await this.getBrowser();

        page = await browser.newPage();

        // Set a realistic user agent to avoid being blocked
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Set screenshot secret header to bypass iframe-only check on preview Worker
        const screenshotSecret = process.env.PREVIEW_SCREENSHOT_SECRET;
        if (screenshotSecret) {
          await page.setExtraHTTPHeaders({
            'X-Screenshot-Key': screenshotSecret,
          });
        }

        // Block only analytics/tracking to speed up loading
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const reqUrl = request.url();
          // Block analytics and tracking scripts
          const blockedUrls = ['google-analytics', 'googletagmanager', 'facebook.net', 'analytics', 'tracking', 'hotjar'];
          const shouldBlock = blockedUrls.some(blocked => reqUrl.includes(blocked));

          if (shouldBlock) {
            request.abort();
          } else {
            request.continue();
          }
        });

        // Set viewport size
        await page.setViewport({
          width: this.width,
          height: this.height,
          deviceScaleFactor: 1,
        });

        // Navigate to the URL
        await page.goto(url, {
          waitUntil: 'load',
          timeout: this.pageLoadTimeout,
        });

        // Wait a bit for any animations to settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // Take screenshot as PNG first (lossless capture)
        const rawScreenshot = await page.screenshot({
          type: 'png',
          fullPage: false,
        });

        const rawBuffer = rawScreenshot instanceof Buffer ? rawScreenshot : Buffer.from(rawScreenshot);
        console.log(`[ScreenshotService] Raw screenshot captured (${rawBuffer.length} bytes)`);

        // Resize using Sharp, keep as PNG
        const compressedBuffer = await sharp(rawBuffer)
          .resize(this.thumbnailWidth, null, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png({
            compressionLevel: 9, // Max compression
          })
          .toBuffer();

        console.log(`[ScreenshotService] Screenshot compressed (${rawBuffer.length} -> ${compressedBuffer.length} bytes, ${Math.round((1 - compressedBuffer.length / rawBuffer.length) * 100)}% reduction)`);

        // Success - close page and return
        if (page) {
          try {
            await page.close();
          } catch (closeError) {
            console.warn('[ScreenshotService] Error closing page:', closeError);
          }
        }

        return compressedBuffer;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Close the page if it was opened
        if (page) {
          try {
            await page.close();
          } catch (closeError) {
            console.warn('[ScreenshotService] Error closing page:', closeError);
          }
        }

        // Check if this is a connection error that warrants a retry
        const isConnectionError = lastError.message.includes('Connection closed') ||
          lastError.message.includes('Protocol error') ||
          lastError.message.includes('Target closed') ||
          lastError.name === 'ConnectionClosedError';

        if (isConnectionError && attempt < maxRetries) {
          console.warn(`[ScreenshotService] Browser connection lost, clearing browser for retry...`);
          // Clear the static browser so next attempt launches a fresh one
          ScreenshotService.browser = null;
          continue; // Retry with fresh browser
        }

        // Non-retryable error or exhausted retries - log and throw
        console.error('[ScreenshotService] Failed to capture screenshot:', error);

        // Log error to PostHog (use captureException to flush immediately)
        try {
          const posthog = getPostHogErrorTracker();
          await posthog.captureException(lastError, {
            projectId: context?.projectId,
            userId: context?.userId,
            screenshotUrl: url,
            component: 'ScreenshotService',
            retryAttempt: attempt,
            isConnectionError,
          });
        } catch (posthogError) {
          console.warn('[ScreenshotService] Failed to log error to PostHog:', posthogError);
        }

        throw lastError;
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Screenshot capture failed after retries');
  }
}
