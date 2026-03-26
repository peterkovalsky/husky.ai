/**
 * Cloudflare Worker for routing published websites
 * Routes subdomains and custom domains to R2 storage based on custom metadata or KV mapping
 *
 * Uses the Cloudflare Cache API to cache full responses at the edge,
 * eliminating KV and R2 reads for repeat requests to the same URL.
 *
 * Custom Metadata Example (Custom Domains):
 * URL: https://www.example.com/assets/index.js
 * Metadata: { project_id: "96a5e023-1ce5-44ff-b2e0-dced0c3e1ff9", environment: "prod", bucket: "husky-app-previews" }
 * R2 Key: 96a5e023-1ce5-44ff-b2e0-dced0c3e1ff9/web/assets/index.js
 *
 * KV Fallback Example (Subdomains):
 * URL: https://happy-cloud-42.huskystudio.app/assets/index.js
 * KV Lookup: happy-cloud-42 → 96a5e023-1ce5-44ff-b2e0-dced0c3e1ff9
 * R2 Key: 96a5e023-1ce5-44ff-b2e0-dced0c3e1ff9/web/assets/index.js
 */

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const cache = caches.default;

      // Handle ACME challenges for HTTP validation (Cloudflare for SaaS)
      // These must bypass cache to return fresh validation tokens
      if (url.pathname.startsWith('/.well-known/acme-challenge/')) {
        console.log(`[Worker] ACME challenge request: ${url.hostname}${url.pathname}`);

        const kvKey = `acme-challenge:${url.hostname}${url.pathname}`;
        const validationToken = await env.SUBDOMAIN_MAPPING.get(kvKey, { cacheTtl: 300 });

        if (validationToken) {
          return new Response(validationToken, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache'
            }
          });
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      // Check Cloudflare Cache first — serves cached responses without KV or R2 reads
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Get project ID from custom metadata (custom domains) or KV (subdomains)
      let projectId;

      // Try custom metadata first (for custom domains with metadata attached)
      if (request.cf?.hostMetadata?.project_id) {
        projectId = request.cf.hostMetadata.project_id;
      } else {
        // Fallback to KV lookup (for subdomains and custom domains without metadata)
        const hostname = url.hostname;

        // Try 1: Check if full hostname is mapped (for custom domains like www.example.com)
        projectId = await env.SUBDOMAIN_MAPPING.get(hostname, { cacheTtl: 3600 });

        if (!projectId) {
          // Try 2: Extract subdomain for *.huskystudio.app pattern
          const parts = hostname.split('.');

          if (parts.length >= 3) {
            const subdomain = parts[0];
            projectId = await env.SUBDOMAIN_MAPPING.get(subdomain, { cacheTtl: 3600 });
          }
        }
      }

      if (!projectId) {
        return new Response('Website not found - domain not mapped', { status: 404 });
      }

      // Map request path to R2 object key
      let objectKey;

      if (url.pathname === '/' || url.pathname === '') {
        objectKey = `${projectId}/web/index.html`;
      } else {
        objectKey = `${projectId}/web${url.pathname}`;
      }

      // Fetch from R2
      const object = await env.R2_BUCKET.get(objectKey);

      if (!object) {
        // SPA fallback: for any 404, serve index.html
        const indexObject = await env.R2_BUCKET.get(`${projectId}/web/index.html`);

        if (indexObject) {
          const spaResponse = new Response(indexObject.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'public, max-age=3600',
            },
          });
          ctx.waitUntil(cache.put(request, spaResponse.clone()));
          return spaResponse;
        }

        return new Response('Website not found', { status: 404 });
      }

      // Return object with proper headers
      const headers = new Headers();
      headers.set(
        'Content-Type',
        object.httpMetadata?.contentType || 'application/octet-stream'
      );
      headers.set('Cache-Control', 'public, max-age=3600');
      headers.set('Access-Control-Allow-Origin', '*');

      // Security headers
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'SAMEORIGIN');
      headers.set('X-XSS-Protection', '1; mode=block');

      const response = new Response(object.body, { headers });
      ctx.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      console.error(`[Worker] ❌ EXCEPTION: ${error.message}`);
      console.error(`[Worker] Stack: ${error.stack}`);
      return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
    }
  },
};
