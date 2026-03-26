/**
 * Cloudflare Worker for routing published websites
 * Routes subdomains and custom domains to R2 storage based on custom metadata or KV mapping
 *
 * Uses the Cloudflare Cache API to cache full responses at the edge,
 * eliminating KV and R2 reads for repeat requests to the same URL.
 */

/**
 * Normalize request URL for cache key: strip query strings so bot URLs
 * with ?tracking=xyz, ?utm_source=..., etc. all share the same cache entry.
 */
function getCacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const cache = caches.default;
      const cacheKey = getCacheKey(request);

      // Handle ACME challenges — bypass cache
      if (url.pathname.startsWith('/.well-known/acme-challenge/')) {
        const kvKey = `acme-challenge:${url.hostname}${url.pathname}`;
        const validationToken = await env.SUBDOMAIN_MAPPING.get(kvKey, { cacheTtl: 300 });

        if (validationToken) {
          return new Response(validationToken, {
            status: 200,
            headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' }
          });
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      // Check Cloudflare Cache first
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Get project ID from custom metadata or KV
      let projectId = null;

      if (request.cf?.hostMetadata?.project_id) {
        projectId = request.cf.hostMetadata.project_id;
      } else {
        const hostname = url.hostname;

        try {
          if (hostname.endsWith('.huskystudio.app')) {
            const subdomain = hostname.split('.')[0];
            projectId = await env.SUBDOMAIN_MAPPING.get(subdomain, { cacheTtl: 3600 });
          } else {
            projectId = await env.SUBDOMAIN_MAPPING.get(hostname, { cacheTtl: 3600 });
          }
        } catch (kvError) {
          console.error(`[Worker] KV error: ${kvError.message}`);
          const retryResponse = new Response(
            getRetryHtml(url.hostname),
            {
              status: 503,
              headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'public, max-age=60',
                'Retry-After': '60',
              },
            }
          );
          ctx.waitUntil(cache.put(cacheKey, retryResponse.clone()));
          return retryResponse;
        }
      }

      if (!projectId) {
        const notFoundResponse = new Response('Website not found - domain not mapped', {
          status: 404,
          headers: { 'Cache-Control': 'public, max-age=3600' },
        });
        ctx.waitUntil(cache.put(cacheKey, notFoundResponse.clone()));
        return notFoundResponse;
      }

      let objectKey;
      if (url.pathname === '/' || url.pathname === '') {
        objectKey = `${projectId}/web/index.html`;
      } else {
        objectKey = `${projectId}/web${url.pathname}`;
      }

      const object = await env.R2_BUCKET.get(objectKey);

      if (!object) {
        const indexObject = await env.R2_BUCKET.get(`${projectId}/web/index.html`);
        if (indexObject) {
          const spaResponse = new Response(indexObject.body, {
            status: 200,
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
          });
          ctx.waitUntil(cache.put(cacheKey, spaResponse.clone()));
          return spaResponse;
        }
        return new Response('Website not found', { status: 404 });
      }

      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=3600');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'SAMEORIGIN');
      headers.set('X-XSS-Protection', '1; mode=block');

      const response = new Response(object.body, { headers });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error(`[Worker] ❌ EXCEPTION: ${error.message}`);
      return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
    }
  },
};

function getRetryHtml(hostname) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Temporarily Unavailable</title>
  <meta http-equiv="refresh" content="60">
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #374151; }
    .container { text-align: center; max-width: 400px; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Temporarily Unavailable</h1>
    <p>${hostname} is experiencing high traffic. This page will automatically refresh in 60 seconds.</p>
  </div>
</body>
</html>`;
}
