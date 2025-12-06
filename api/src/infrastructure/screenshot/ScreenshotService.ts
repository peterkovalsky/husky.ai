import puppeteer, { Browser } from 'puppeteer';
import sharp from 'sharp';
import { getPostHogErrorTracker } from '../monitoring/PostHogErrorTracker';

export interface IScreenshotService {
  captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer>;
}

export class ScreenshotService implements IScreenshotService {
  private readonly width = 1280;
  private readonly height = 720;
  private readonly pageLoadTimeout = 30000; // 30 seconds
  private readonly thumbnailWidth = 480; // Resize for thumbnails

  /**
   * Captures a screenshot of the given URL
   * @param url The URL to capture
   * @param context Optional context for error tracking
   * @returns Buffer containing the PNG screenshot
   */
  async captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer> {
    let browser: Browser | null = null;

    try {
      console.log(`[ScreenshotService] Capturing screenshot of ${url}`);

      // Use system Chromium in Docker (set via PUPPETEER_EXECUTABLE_PATH)
      const isDev = process.env.NODE_ENV !== 'production';
      browser = await puppeteer.launch({
        headless: isDev ? 'shell' : true, // Use shell mode in dev to avoid HTTPS auto-upgrade issues
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
          // Use /tmp for user data to avoid permission issues
          '--user-data-dir=/tmp/chromium-user-data',
        ],
        // Increase protocol timeout for slower container environments
        protocolTimeout: 30000,
      });

      const page = await browser.newPage();

      // Set a realistic user agent to avoid being blocked
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Block only analytics/tracking to speed up loading
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        // Block analytics and tracking scripts
        const blockedUrls = ['google-analytics', 'googletagmanager', 'facebook.net', 'analytics', 'tracking', 'hotjar'];
        const shouldBlock = blockedUrls.some(blocked => url.includes(blocked));

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

      return compressedBuffer;

    } catch (error) {
      console.error('[ScreenshotService] Failed to capture screenshot:', error);

      // Log error to PostHog (use captureException to flush immediately)
      try {
        const posthog = getPostHogErrorTracker();
        await posthog.captureException(error instanceof Error ? error : new Error(String(error)), {
          projectId: context?.projectId,
          userId: context?.userId,
          screenshotUrl: url,
          component: 'ScreenshotService',
        });
      } catch (posthogError) {
        console.warn('[ScreenshotService] Failed to log error to PostHog:', posthogError);
      }

      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.warn('[ScreenshotService] Error closing browser:', closeError);
        }
      }
    }
  }
}
