export interface Env {
  PREVIEW_BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string; // comma-separated: "https://app.huskystudio.app,https://localhost:5173"
  SCREENSHOT_SECRET: string; // shared secret for screenshot service to bypass iframe-only check
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

    // Check the Origin header for cross-origin validation.
    const origin = request.headers.get('Origin');
    const selfOrigin = url.origin; // e.g. https://preview-dev.huskystudio.app

    // Allow when:
    // - No Origin header (direct access)
    // - Origin matches self (Vite's crossorigin attribute on <script type="module">
    //   causes browsers to send Origin even for same-origin requests)
    // - Origin is in the allowed list
    const isAllowedOrigin =
      !origin ||
      origin === selfOrigin ||
      allowedOrigins.some((allowed) => origin === allowed || allowed === '*');

    if (!isAllowedOrigin) {
      return new Response('Forbidden: Invalid origin', { status: 403 });
    }

    // Block direct browser navigation (pasting URL in address bar).
    // Modern browsers send Sec-Fetch-Dest: "document" for top-level navigation
    // and "iframe" for iframe loads. Block "document" to enforce iframe-only access.
    // Older browsers that don't send this header are allowed through (permissive).
    // The screenshot service (Puppeteer) bypasses this via X-Screenshot-Key header.
    const fetchDest = request.headers.get('Sec-Fetch-Dest');
    const screenshotKey = request.headers.get('X-Screenshot-Key');
    const isScreenshotService = screenshotKey === env.SCREENSHOT_SECRET;

    if (fetchDest === 'document' && !isScreenshotService) {
      return new Response('Forbidden: This content can only be viewed within the Husky app.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Extract project ID from path: /projects/{projectId}/...
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts[0] !== 'projects' || !pathParts[1]) {
      return new Response('Invalid path: expected /projects/{projectId}/', { status: 400 });
    }
    const projectId = pathParts[1];

    // Serve file from R2
    let path = url.pathname.slice(1); // Remove leading slash

    if (!path || path.endsWith('/')) {
      path = path + 'index.html';
    } else if (!path.includes('.')) {
      // SPA route fallback - serve index.html for client-side routes
      path = `projects/${projectId}/index.html`;
    }

    const object = await env.PREVIEW_BUCKET.get(path);
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    // Build CSP frame-ancestors from allowed origins
    const frameAncestors = allowedOrigins.join(' ');

    return new Response(object.body, {
      headers: {
        'Content-Type': getContentType(path),
        'Cache-Control': 'public, max-age=3600',
        // Only allow embedding from Husky app domains
        'Content-Security-Policy': `frame-ancestors ${frameAncestors}`,
        'X-Frame-Options': 'SAMEORIGIN', // Fallback for older browsers
      },
    });
  },
};

function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    html: 'text/html',
    js: 'application/javascript',
    css: 'text/css',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    webp: 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
}
