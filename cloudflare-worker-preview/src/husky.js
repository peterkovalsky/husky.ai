/**
 * Husky Studio - Runtime script injected into all user websites.
 *
 * Features:
 * 1. Screenshot capture (any context) - listens for CAPTURE_SCREENSHOT postMessage
 * 2. Location tracking (iframe only) - reports route/scroll changes to parent
 * 3. Page context (iframe only) - sends page title/sections to parent
 *
 * Configuration: reads window.__HUSKY_CONFIG__ (injected by the serving worker)
 *   - allowedOrigins: string[] - origins allowed for postMessage validation
 *
 * Hosted on R2 public media bucket. Update by uploading a new version.
 */
(function() {
  var config = window.__HUSKY_CONFIG__ || {};
  var ALLOWED_ORIGINS = config.allowedOrigins || [];

  // ========================================================================
  // Shared utilities
  // ========================================================================

  function isAllowedOrigin(origin) {
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return true;
    if (origin.indexOf('http://localhost:') === 0) {
      for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
        if (ALLOWED_ORIGINS[i].indexOf('http://localhost:') === 0) return true;
      }
    }
    return false;
  }

  // Detect the app's base path from the initial URL (before React Router navigates).
  // e.g. /projects/{uuid}/ -> basePath = '/projects/{uuid}/'
  var basePath = window.location.pathname;
  if (basePath.charAt(basePath.length - 1) !== '/') basePath += '/';

  function getCurrentPath() {
    var fullPath = window.location.pathname;
    var appPath = fullPath;
    if (fullPath.indexOf(basePath) === 0) {
      appPath = '/' + fullPath.substring(basePath.length);
    }
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

  // ========================================================================
  // 1. Screenshot Capture (works in any context, not just iframe)
  // ========================================================================

  window.addEventListener('message', function(event) {
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
    var winScrollX = window.scrollX || window.pageXOffset || 0;
    var winScrollY = window.scrollY || window.pageYOffset || 0;
    if (winScrollY > 0 || winScrollX > 0) {
      console.log('[HuskyScreenshot] Using window scroll:', winScrollX, winScrollY);
      return { scrollX: winScrollX, scrollY: winScrollY };
    }

    var candidates = [
      document.documentElement,
      document.body,
      document.getElementById('root')
    ];
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

    // html2canvas renders the full target element into an offscreen canvas,
    // then crops. For very tall pages (e.g. 10000px at 2x scale = 20000px),
    // this exceeds browser canvas height limits (~16384px on macOS) and
    // produces a blank result. Fix: clip the cloned body to just the area
    // we need so the offscreen canvas stays within GPU limits.
    var maxRenderHeight = scrollY + height + 200;

    html2canvas(document.body, {
      x: scrollX,
      y: scrollY,
      width: width,
      height: height,
      scrollX: 0,
      scrollY: 0,
      windowWidth: width,
      windowHeight: height,
      scale: scale,
      useCORS: true,
      proxy: '/_proxy',
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
      onclone: function(clonedDoc) {
        // Clip cloned body to prevent canvas overflow
        clonedDoc.body.style.maxHeight = maxRenderHeight + 'px';
        clonedDoc.body.style.overflow = 'hidden';
        console.log('[HuskyScreenshot] Clipped clone height to ' + maxRenderHeight + 'px');
      }
    }).then(function(canvas) {
      var dataUrl = canvas.toDataURL('image/png');
      console.log('[HuskyScreenshot] Capture complete, dataUrl length:', dataUrl.length);
      source.postMessage({ type: 'SCREENSHOT_RESULT', dataUrl: dataUrl }, origin);
    }).catch(function(err) {
      console.error('[HuskyScreenshot] Capture failed:', err);
      source.postMessage({ type: 'SCREENSHOT_RESULT', dataUrl: null, error: String(err) }, origin);
    });
  }

  // ========================================================================
  // Iframe-only features (location tracking + page context)
  // ========================================================================

  if (!window.parent || window.parent === window) return;

  // --- Location tracking state ---
  var lastPath = '';
  var scrollTimer = null;
  var isNavigating = false;

  function sendLocationUpdate() {
    if (isNavigating) return;
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

  // --- Page context state ---
  var pageContextTimer = null;

  function getPageContext() {
    var sections = [];
    var els = document.querySelectorAll('h1, h2, h3, section, [data-section]');
    for (var i = 0; i < els.length && sections.length < 10; i++) {
      var text = (els[i].textContent || '').trim();
      if (text && text.length < 100) {
        sections.push(text);
      }
    }
    return {
      type: 'husky:pageContext',
      path: getCurrentPath(),
      title: document.title,
      sections: sections
    };
  }

  function sendPageContext() {
    clearTimeout(pageContextTimer);
    pageContextTimer = setTimeout(function() {
      window.parent.postMessage(getPageContext(), '*');
    }, 100);
  }

  // ========================================================================
  // Unified history monkey-patching (single patch for both features)
  // ========================================================================

  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    sendLocationUpdate();
    sendPageContext();
  };
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    sendLocationUpdate();
    sendPageContext();
  };

  // --- Location: popstate + scroll ---
  window.addEventListener('popstate', function() {
    sendLocationUpdate();
    sendPageContext();
  });

  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(sendLocationUpdate, 200);
  }, true);

  // --- Location: listen for navigate command from parent ---
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'HUSKY_NAVIGATE') return;
    var targetPath = event.data.path;
    var targetScrollY = event.data.scrollY || 0;
    console.log('[HuskyLocation] Navigate request:', targetPath, 'scrollY:', targetScrollY);
    if (!targetPath || targetPath === '/' || targetPath === getCurrentPath()) {
      if (targetScrollY > 0) {
        setTimeout(function() { window.scrollTo(0, targetScrollY); }, 100);
      }
      return;
    }
    var fullPath = basePath + targetPath.replace(/^\//, '');
    console.log('[HuskyLocation] Navigating to:', fullPath);
    isNavigating = true;
    history.pushState({}, '', fullPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    isNavigating = false;
    sendLocationUpdate();
    if (targetScrollY > 0) {
      setTimeout(function() { window.scrollTo(0, targetScrollY); }, 200);
    }
  });

  // --- Page context: hashchange + title observer ---
  window.addEventListener('hashchange', sendPageContext);

  var titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(sendPageContext).observe(titleEl, { childList: true, subtree: true });
  }

  // --- Initial events ---
  sendLocationUpdate();
  setTimeout(sendPageContext, 500);
})();
