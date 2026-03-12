import * as fs from 'fs';
import * as path from 'path';
import { IBuildStep, StepResult } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';

/**
 * PreviewScriptInjectionStep: Injects helper scripts into preview dist/index.html
 *
 * Responsibilities:
 * - Read dist/index.html from the built preview
 * - Inject html2canvas CDN + postMessage listener script before </body>
 * - Inject location tracking script that reports route/scroll to parent
 * - Write modified HTML back to disk
 *
 * This step runs AFTER PreviewBuildStep and BEFORE PreviewUploadStep.
 * The injected scripts enable:
 * 1. Screenshot capture for the annotation feature
 * 2. Route/scroll tracking so the parent can restore position after rebuilds
 *
 * Security: The postMessage listener validates event.origin against known
 * frontend domains before responding.
 *
 * ProductionBuildStep later cleans dist/ and rebuilds from unmodified source,
 * so the injected scripts do NOT appear in production/published apps.
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
      console.log(`[${this.stepName}] Injecting preview helper scripts...`);

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

      // Build the injection scripts
      const screenshotScript = this.buildScreenshotScript();
      const locationScript = this.buildLocationTrackingScript();
      const injectionScripts = `${screenshotScript}\n${locationScript}`;

      // Inject before </body>
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${injectionScripts}\n</body>`);
      } else {
        // Fallback: append at the end
        html += `\n${injectionScripts}`;
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

  private buildScreenshotScript(): string {
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

  function isAllowedOrigin(origin) {
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return true;
    // Allow any localhost port for local development
    if (origin.indexOf('http://localhost:') === 0) {
      for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
        if (ALLOWED_ORIGINS[i].indexOf('http://localhost:') === 0) return true;
      }
    }
    return false;
  }

  window.addEventListener('message', function(event) {
    // Check message type first to avoid noisy warnings for non-screenshot messages
    if (!event.data || event.data.type !== 'CAPTURE_SCREENSHOT') return;
    if (!isAllowedOrigin(event.origin)) {
      console.warn('[HuskyScreenshot] Origin not allowed:', event.origin);
      return;
    }
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

  function findScrollPosition() {
    // Check window scroll first (body/document scrolling)
    var winScrollX = window.scrollX || window.pageXOffset || 0;
    var winScrollY = window.scrollY || window.pageYOffset || 0;
    if (winScrollY > 0 || winScrollX > 0) {
      console.log('[HuskyScreenshot] Using window scroll:', winScrollX, winScrollY);
      return { scrollX: winScrollX, scrollY: winScrollY };
    }

    // Fallback: find scrollable container (React apps often use a div with overflow-auto)
    var candidates = [
      document.documentElement,
      document.body,
      document.getElementById('root')
    ];
    // Also check direct children of #root (common pattern: <div class="h-screen overflow-auto">)
    var root = document.getElementById('root');
    if (root) {
      for (var i = 0; i < root.children.length; i++) {
        candidates.push(root.children[i]);
      }
    }

    for (var j = 0; j < candidates.length; j++) {
      var el = candidates[j];
      if (el && el.scrollTop > 0) {
        console.log('[HuskyScreenshot] Using container scroll from:', el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''), el.scrollLeft, el.scrollTop);
        return { scrollX: el.scrollLeft || 0, scrollY: el.scrollTop };
      }
    }

    console.log('[HuskyScreenshot] No scroll detected');
    return { scrollX: 0, scrollY: 0 };
  }

  function captureAndSend(source, origin) {
    console.log('[HuskyScreenshot] html2canvas-pro loaded, capturing viewport...');
    var scale = window.devicePixelRatio || 1;
    var scroll = findScrollPosition();
    var scrollX = scroll.scrollX;
    var scrollY = scroll.scrollY;
    var width = window.innerWidth;
    var height = window.innerHeight;

    console.log('[HuskyScreenshot] Capture params: scroll=(' + scrollX + ',' + scrollY + '), viewport=(' + width + 'x' + height + '), scale=' + scale);

    html2canvas(document.body, {
      x: scrollX,
      y: scrollY,
      width: width,
      height: height,
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.scrollWidth || width,
      windowHeight: document.documentElement.scrollHeight || height,
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

  private buildLocationTrackingScript(): string {
    return `<script>
(function() {
  if (!window.parent || window.parent === window) return;

  var lastPath = '';
  var scrollTimer = null;

  // Detect the app's base path from the initial URL (before React Router navigates).
  // e.g. /projects/{uuid}/ → basePath = '/projects/{uuid}/'
  var basePath = window.location.pathname;
  if (basePath.charAt(basePath.length - 1) !== '/') basePath += '/';

  function getCurrentPath() {
    var fullPath = window.location.pathname;
    // Strip base path to get app-relative route (e.g. '/about' instead of '/projects/{uuid}/about')
    var appPath = fullPath;
    if (fullPath.indexOf(basePath) === 0) {
      appPath = '/' + fullPath.substring(basePath.length);
    }
    // Include hash but strip cache-busting query params
    return appPath + window.location.hash;
  }

  function findScrollY() {
    var winScroll = window.scrollY || window.pageYOffset || 0;
    if (winScroll > 0) return winScroll;
    var candidates = [document.documentElement, document.body, document.getElementById('root')];
    var root = document.getElementById('root');
    if (root) {
      for (var i = 0; i < root.children.length; i++) candidates.push(root.children[i]);
    }
    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j] && candidates[j].scrollTop > 0) return candidates[j].scrollTop;
    }
    return 0;
  }

  function sendLocationUpdate() {
    var path = getCurrentPath();
    var scrollY = findScrollY();
    console.log('[HuskyLocation] Sending update:', path, 'scrollY:', scrollY);
    window.parent.postMessage({
      type: 'HUSKY_LOCATION_UPDATE',
      path: path,
      scrollY: scrollY
    }, '*');
    lastPath = path;
  }

  // Monkey-patch pushState/replaceState to detect React Router navigations
  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    sendLocationUpdate();
  };
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    sendLocationUpdate();
  };
  window.addEventListener('popstate', function() { sendLocationUpdate(); });

  // Throttled scroll reporting
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(sendLocationUpdate, 200);
  }, true);

  // Listen for navigate command from parent
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'HUSKY_NAVIGATE') return;
    var targetPath = event.data.path;
    var targetScrollY = event.data.scrollY || 0;
    console.log('[HuskyLocation] Navigate request:', targetPath, 'scrollY:', targetScrollY);
    if (!targetPath || targetPath === '/' || targetPath === getCurrentPath()) {
      // Just restore scroll if already on the right page
      if (targetScrollY > 0) {
        setTimeout(function() { window.scrollTo(0, targetScrollY); }, 100);
      }
      return;
    }
    // Prepend base path to get the full URL path for pushState
    var fullPath = basePath + targetPath.replace(/^\\//, '');
    console.log('[HuskyLocation] Navigating to:', fullPath);
    // Navigate via pushState + popstate to trigger React Router
    history.pushState({}, '', fullPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    // Restore scroll after React Router renders
    if (targetScrollY > 0) {
      setTimeout(function() { window.scrollTo(0, targetScrollY); }, 200);
    }
  });

  // Send initial location
  sendLocationUpdate();
})();
</script>`;
  }
}
