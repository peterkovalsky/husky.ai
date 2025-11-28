import puppeteer, { Browser } from 'puppeteer';
import { getPostHogErrorTracker } from '../monitoring/PostHogErrorTracker';

export interface IScreenshotService {
  captureScreenshot(url: string, context?: { projectId?: string; userId?: string }): Promise<Buffer>;
}

export class ScreenshotService implements IScreenshotService {
  private readonly width = 1280;
  private readonly height = 720;
  private readonly pageLoadTimeout = 30000; // 30 seconds
  private readonly screenshotTimeout = 5000; // 5 seconds

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

      browser = await puppeteer.launch({
        headless: 'shell', // Use shell mode to avoid HTTPS auto-upgrade issues
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
          '--disable-features=HttpsUpgrades,HttpsFirstModeV2,HttpsFirstModeForTypedNavigations,HttpsOnlyMode',
          '--disable-blink-features=AutomationControlled',
        ],
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

      // Take screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      console.log(`[ScreenshotService] Screenshot captured successfully (${screenshot.length} bytes)`);

      // Ensure we return a Buffer
      if (screenshot instanceof Buffer) {
        return screenshot;
      }
      return Buffer.from(screenshot);

    } catch (error) {
      console.error('[ScreenshotService] Failed to capture screenshot:', error);

      // Log error to PostHog
      try {
        const posthog = getPostHogErrorTracker();
        await posthog.captureError(error instanceof Error ? error : new Error(String(error)), {
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
