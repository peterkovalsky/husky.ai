/**
 * Cloudflare Worker for routing published websites
 * Routes custom domains to R2 storage based on subdomain → project ID mapping
 *
 * Example:
 * URL: https://happy-cloud-42.huskystudio.ai/assets/index.js
 * KV Lookup: happy-cloud-42 → 96a5e023-1ce5-44ff-b2e0-dced0c3e1ff9
 * R2 Key: 96a5e023-1ce5-44ff-b2e0-dced0c3e1ff9/web/assets/index.js
 */

export interface Env {
  R2_BUCKET: R2Bucket;
  SUBDOMAIN_MAPPING: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle ACME challenges for HTTP validation (Cloudflare for SaaS)
    // During SSL certificate validation, Cloudflare makes requests to /.well-known/acme-challenge/
    // We look up the expected validation token from KV and return it
    if (url.pathname.startsWith('/.well-known/acme-challenge/')) {
      console.log(`[Worker] ACME challenge request: ${url.hostname}${url.pathname}`);

      // Build the KV key: acme-challenge:hostname/path
      const kvKey = `acme-challenge:${url.hostname}${url.pathname}`;
      console.log(`[Worker] Looking up validation token in KV: ${kvKey}`);

      // Get the validation token from KV
      const validationToken = await env.SUBDOMAIN_MAPPING.get(kvKey);

      if (validationToken) {
        console.log(`[Worker] Found validation token, returning for HTTP validation`);
        return new Response(validationToken, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache'
          }
        });
      } else {
        console.log(`[Worker] No validation token found in KV for ${kvKey}`);
        return new Response('Not Found', { status: 404 });
      }
    }

    // Extract subdomain from hostname
    // Example: "happy-cloud-42.huskystudio.ai" → "happy-cloud-42"
    const hostname = url.hostname;
    const parts = hostname.split('.');

    if (parts.length < 3) {
      return new Response('Invalid hostname - missing subdomain', { status: 400 });
    }

    const subdomain = parts[0];

    // Look up project ID from KV
    const projectId = await env.SUBDOMAIN_MAPPING.get(subdomain);

    if (!projectId) {
      console.log(`[Worker] No project found for subdomain: ${subdomain}`);
      return new Response('Website not found - subdomain not mapped', { status: 404 });
    }

    console.log(`[Worker] Mapped subdomain ${subdomain} → project ${projectId}`);

    // Map request path to R2 object key
    // URL path: /assets/index.js → R2 key: {projectId}/web/assets/index.js
    let objectKey: string;

    if (url.pathname === '/' || url.pathname === '') {
      objectKey = `${projectId}/web/index.html`;
    } else {
      objectKey = `${projectId}/web${url.pathname}`;
    }

    console.log(`[Worker] Request: ${url.pathname} → R2: ${objectKey}`);

    // Fetch from R2
    const object = await env.R2_BUCKET.get(objectKey);

    if (!object) {
      // SPA fallback: for any 404, serve index.html
      // This handles React Router paths like /about, /contact, etc.
      console.log(`[Worker] Object not found, trying SPA fallback`);
      const indexObject = await env.R2_BUCKET.get(`${projectId}/web/index.html`);

      if (indexObject) {
        return new Response(indexObject.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=3600',
          },
        });
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
    headers.set('Access-Control-Allow-Origin', '*'); // CORS

    // Add security headers
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('X-XSS-Protection', '1; mode=block');

    return new Response(object.body, { headers });
  },
};
