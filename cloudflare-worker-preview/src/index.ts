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
    // For iframe navigation (GET), browsers send Referer instead of Origin,
    // so fall back to extracting origin from Referer.
    const originHeader = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const origin = originHeader || (referer ? new URL(referer).origin : null);
    const selfOrigin = url.origin; // e.g. https://preview-dev.huskystudio.app

    // Allow when:
    // - No Origin header (direct access)
    // - Origin matches self (Vite's crossorigin attribute on <script type="module">
    //   causes browsers to send Origin even for same-origin requests)
    // - Origin is in the allowed list
    const isAllowedOrigin =
      !origin ||
      origin === selfOrigin ||
      allowedOrigins.some((allowed) => origin === allowed || allowed === '*') ||
      // Allow any localhost port for local development
      (origin.startsWith('http://localhost:') && allowedOrigins.some((a) => a.startsWith('http://localhost:')));

    if (!isAllowedOrigin) {
      return new Response('Forbidden: Invalid origin', { status: 403 });
    }

    // Resource proxy for screenshot capture.
    // The injected screenshot helper uses dom-to-image-more which needs to XHR-fetch
    // all images/fonts/CSS to inline them. Cross-origin resources (e.g. OpenStreetMap
    // tiles, stock photos) block XHR due to CORS. This proxy fetches them server-side.
    if (url.pathname === '/_proxy') {
      return handleProxyRequest(request, url);
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
    }

    let object = await env.PREVIEW_BUCKET.get(path);

    // Directory-style path resolution for Astro SSG multi-page sites
    // e.g., projects/{id}/about → projects/{id}/about/index.html
    if (!object && !path.includes('.')) {
      const dirPath = path.endsWith('/') ? path + 'index.html' : path + '/index.html';
      object = await env.PREVIEW_BUCKET.get(dirPath);
    }

    // SPA route fallback - serve index.html for client-side routes (React apps)
    if (!object && !path.includes('.')) {
      object = await env.PREVIEW_BUCKET.get(`projects/${projectId}/index.html`);
    }

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    // Build CSP frame-ancestors from allowed origins
    // Replace specific localhost ports with a wildcard so any local dev port works
    const frameAncestors = allowedOrigins
      .filter((o) => !o.startsWith('http://localhost:'))
      .concat('http://localhost:*')
      .join(' ');

    const contentType = getContentType(path);
    // HTML files: always revalidate (ensures fresh CSP headers and latest build)
    // Assets (JS/CSS/images): cache aggressively (filenames are hashed by Vite)
    const cacheControl = contentType === 'text/html'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';

    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        // Only allow embedding from Husky app domains
        'Content-Security-Policy': `frame-ancestors ${frameAncestors}`,
        'X-Frame-Options': 'SAMEORIGIN', // Fallback for older browsers
      },
    });
  },
};

/**
 * Proxy handler for screenshot capture.
 * Fetches external resources server-side so dom-to-image-more can inline them
 * without hitting browser CORS restrictions.
 */
async function handleProxyRequest(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response('Only http/https allowed', { status: 400 });
  }

  if (isPrivateHostname(parsed.hostname)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'HuskyPreviewProxy/1.0' },
    });

    if (!response.ok) {
      return new Response('Upstream error', { status: response.status });
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const responseType = url.searchParams.get('responseType');

    // html2canvas proxy protocol: return data URL as plain text
    if (responseType === 'text') {
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      return new Response(`data:${contentType};base64,${base64}`, {
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Failed to fetch resource', { status: 502 });
  }
}

function isPrivateHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  const parts = hostname.split('.');
  if (parts.length === 4) {
    const a = parseInt(parts[0]);
    const b = parseInt(parts[1]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
}

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
