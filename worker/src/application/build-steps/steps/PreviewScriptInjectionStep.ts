import * as fs from 'fs';
import * as path from 'path';
import { IBuildStep, StepResult } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';

/**
 * PreviewScriptInjectionStep: Injects screenshot helper into preview dist/index.html
 *
 * Responsibilities:
 * - Read dist/index.html from the built preview
 * - Inject html2canvas CDN + postMessage listener script before </body>
 * - Write modified HTML back to disk
 *
 * This step runs AFTER PreviewBuildStep and BEFORE PreviewUploadStep.
 * The injected script enables the frontend to request screenshots from the
 * preview iframe via postMessage for the annotation feature.
 *
 * Security: The postMessage listener validates event.origin against known
 * frontend domains before responding.
 *
 * ProductionBuildStep later cleans dist/ and rebuilds from unmodified source,
 * so the injected script does NOT appear in production/published apps.
 */
export class PreviewScriptInjectionStep implements IBuildStep {
  readonly stepName = 'Preview Script Injection';
  readonly stepStatus = 'INJECTING_PREVIEW_SCRIPT';

  constructor(
    private buildRepository: IBuildRepository
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();

    try {
      console.log(`[${this.stepName}] Injecting screenshot helper into preview build...`);

      // Get app directory from previous step
      const appDirectory = context.getStepData<string>('appDirectory');
      if (!appDirectory) {
        throw new Error('App directory not found in context');
      }

      const indexHtmlPath = path.join(appDirectory, 'dist', 'index.html');

      // Read the built index.html
      if (!fs.existsSync(indexHtmlPath)) {
        console.warn(`[${this.stepName}] dist/index.html not found, skipping injection`);
        return { success: true, metrics: {} };
      }

      let html = fs.readFileSync(indexHtmlPath, 'utf-8');

      // Build the injection script
      const injectionScript = this.buildInjectionScript();

      // Inject before </body>
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${injectionScript}\n</body>`);
      } else {
        // Fallback: append at the end
        html += `\n${injectionScript}`;
      }

      // Write back
      fs.writeFileSync(indexHtmlPath, html, 'utf-8');

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Completed in ${duration}ms`);

      return {
        success: true,
        metrics: {
          previewScriptInjectionTimeMs: duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Failed after ${duration}ms:`, error);

      // Non-fatal: if injection fails, preview still works, just no annotation screenshots
      console.warn(`[${this.stepName}] Continuing without screenshot helper (non-fatal)`);
      return {
        success: true,
        metrics: {
          previewScriptInjectionTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  private buildInjectionScript(): string {
    // Known frontend origins for postMessage validation
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'https://huskystudio.co',
      'https://app.huskystudio.ai',
    ];

    return `<script>
(function() {
  var ALLOWED_ORIGINS = ${JSON.stringify(allowedOrigins)};
  console.log('[HuskyScreenshot] Screenshot helper loaded. Listening for CAPTURE_SCREENSHOT from:', ALLOWED_ORIGINS);

  window.addEventListener('message', function(event) {
    console.log('[HuskyScreenshot] Received postMessage:', event.data?.type, 'from origin:', event.origin);
    if (ALLOWED_ORIGINS.indexOf(event.origin) === -1) {
      console.warn('[HuskyScreenshot] Origin not allowed:', event.origin);
      return;
    }
    if (!event.data || event.data.type !== 'CAPTURE_SCREENSHOT') return;
    console.log('[HuskyScreenshot] Capture requested, loading html2canvas-pro...');

    if (typeof html2canvas === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.6.7/dist/html2canvas-pro.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = function() { captureAndSend(event.source, event.origin); };
      script.onerror = function() {
        console.error('[HuskyScreenshot] Failed to load html2canvas-pro');
        event.source.postMessage({ type: 'SCREENSHOT_RESULT', dataUrl: null, error: 'Failed to load html2canvas-pro' }, event.origin);
      };
      document.head.appendChild(script);
    } else {
      captureAndSend(event.source, event.origin);
    }
  });

  function captureAndSend(source, origin) {
    console.log('[HuskyScreenshot] html2canvas-pro loaded, capturing viewport...');
    var scale = window.devicePixelRatio || 1;
    var scrollX = window.scrollX || window.pageXOffset || 0;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var width = window.innerWidth;
    var height = window.innerHeight;

    html2canvas(document.body, {
      x: scrollX,
      y: scrollY,
      width: width,
      height: height,
      scrollX: scrollX,
      scrollY: scrollY,
      windowWidth: width,
      windowHeight: height,
      scale: scale,
      proxy: '/_proxy',
      logging: false,
      imageTimeout: 15000,
      removeContainer: true
    }).then(function(canvas) {
      var dataUrl = canvas.toDataURL('image/png');
      console.log('[HuskyScreenshot] Capture complete, dataUrl length:', dataUrl.length);
      source.postMessage({ type: 'SCREENSHOT_RESULT', dataUrl: dataUrl }, origin);
    }).catch(function(err) {
      console.error('[HuskyScreenshot] Capture failed:', err);
      source.postMessage({ type: 'SCREENSHOT_RESULT', dataUrl: null, error: String(err) }, origin);
    });
  }
})();
</script>`;
  }
}
