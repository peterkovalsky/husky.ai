/**
 * Cloudflare Worker for routing published websites
 * Routes subdomains and custom domains to R2 storage based on custom metadata or KV mapping
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

export interface Env {
  R2_BUCKET: R2Bucket;
  SUBDOMAIN_MAPPING: KVNamespace;
}

interface CustomHostMetadata {
  project_id?: string;
  environment?: string;
  bucket?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      console.log(`[Worker] === Incoming Request ===`);
      console.log(`[Worker] URL: ${request.url}`);
      console.log(`[Worker] Hostname: ${url.hostname}`);
      console.log(`[Worker] Path: ${url.pathname}`);
      console.log(`[Worker] Method: ${request.method}`);

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

      // Get project ID from custom metadata (custom domains) or KV (subdomains)
      let projectId: string | null = null;

      // Try custom metadata first (for custom domains with metadata attached)
      const cf = request.cf as any;
      const hostMetadata = cf?.hostMetadata as CustomHostMetadata | undefined;

      if (hostMetadata?.project_id) {
        projectId = hostMetadata.project_id;
        console.log(`[Worker] Using custom metadata - Project: ${projectId}`);
        console.log(`[Worker] Metadata: ${JSON.stringify(hostMetadata)}`);
      } else {
        console.log(`[Worker] No custom metadata found, falling back to KV lookup`);

        // Fallback to KV lookup (for subdomains and custom domains without metadata)
        const hostname = url.hostname;

        // Try 1: Check if full hostname is mapped (for custom domains like www.example.com)
        console.log(`[Worker] KV Lookup #1: Trying full hostname: "${hostname}"`);
        projectId = await env.SUBDOMAIN_MAPPING.get(hostname);

        if (projectId) {
          console.log(`[Worker] ✓ KV Match! ${hostname} → project ${projectId}`);
        } else {
          console.log(`[Worker] ✗ No KV match for full hostname`);

          // Try 2: Extract subdomain for *.huskystudio.app pattern
          const parts = hostname.split('.');

          if (parts.length >= 3) {
            const subdomain = parts[0];
            console.log(`[Worker] KV Lookup #2: Trying subdomain: "${subdomain}"`);
            projectId = await env.SUBDOMAIN_MAPPING.get(subdomain);

            if (projectId) {
              console.log(`[Worker] ✓ KV Match! subdomain ${subdomain} → project ${projectId}`);
            } else {
              console.log(`[Worker] ✗ No KV match for subdomain`);
            }
          } else {
            console.log(`[Worker] Cannot extract subdomain (parts.length = ${parts.length})`);
          }
        }
      }

      if (!projectId) {
        console.log(`[Worker] ❌ ERROR: No project found for hostname: ${url.hostname}`);
        return new Response('Website not found - domain not mapped', { status: 404 });
      }

      // Map request path to R2 object key
      // URL path: /assets/index.js → R2 key: {projectId}/web/assets/index.js
      let objectKey: string;

      if (url.pathname === '/' || url.pathname === '') {
        objectKey = `${projectId}/web/index.html`;
      } else {
        objectKey = `${projectId}/web${url.pathname}`;
      }

      console.log(`[Worker] Fetching from R2: ${objectKey}`);

      // Fetch from R2
      const object = await env.R2_BUCKET.get(objectKey);

      if (!object) {
        // SPA fallback: for any 404, serve index.html
        // This handles React Router paths like /about, /contact, etc.
        console.log(`[Worker] ✗ R2 object not found: ${objectKey}`);
        console.log(`[Worker] Trying SPA fallback: ${projectId}/web/index.html`);
        const indexObject = await env.R2_BUCKET.get(`${projectId}/web/index.html`);

        if (indexObject) {
          console.log(`[Worker] ✓ SPA fallback successful - serving index.html`);
          return new Response(indexObject.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }

        console.log(`[Worker] ❌ ERROR: No index.html found in R2`);
        return new Response('Website not found', { status: 404 });
      }

      console.log(`[Worker] ✓ R2 object found - serving ${object.httpMetadata?.contentType || 'unknown type'}`);

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

      console.log(`[Worker] === Request Complete - 200 OK ===`);
      return new Response(object.body, { headers });
    } catch (error: any) {
      console.error(`[Worker] ❌ EXCEPTION: ${error.message}`);
      console.error(`[Worker] Stack: ${error.stack}`);
      return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
    }
  },
};
