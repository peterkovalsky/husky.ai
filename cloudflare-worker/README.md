# Cloudflare Worker - Published Sites Router

This Cloudflare Worker routes requests from custom domains to published websites stored in R2.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Login to Cloudflare:
```bash
npx wrangler login
```

3. Create R2 bucket (if not already created):
```bash
npx wrangler r2 bucket create husky-published-apps
```

4. Deploy the worker:
```bash
npm run deploy
```

## Configuration

After deployment, configure custom domain routes in the Cloudflare dashboard:

1. Go to Workers & Pages > husky-published-sites
2. Go to Settings > Triggers > Custom Domains
3. Add custom domain: `*.huskystudio.ai`

Alternatively, use Cloudflare for SaaS custom hostnames (recommended).

## Local Development

Run the worker locally:
```bash
npm run dev
```

## How It Works

1. User visits: `https://happy-cloud-42.huskystudio.ai/index.html`
2. Worker extracts subdomain: `happy-cloud-42`
3. Worker constructs R2 key: `happy-cloud-42/web/index.html`
4. Worker fetches from R2 and returns to user
5. For 404s, falls back to `index.html` (SPA routing support)

## Monitoring

View real-time logs:
```bash
npm run tail
```
