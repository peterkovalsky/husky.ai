# Use Node.js 22 LTS on Debian Slim
# Puppeteer requires glibc and system libraries that Alpine doesn't provide reliably.
# Debian Slim is the officially supported base for Puppeteer's bundled Chrome.
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install system dependencies for native modules and Puppeteer's Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    fonts-freefont-ttf \
    fonts-dejavu-core \
    fontconfig \
    libfreetype6 \
    libharfbuzz0b \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install TypeScript and Vite globally for building generated apps
RUN npm install -g typescript vite

# Copy worker package files
# Build context is husky.ai root: docker build -f worker/Dockerfile .
COPY worker/package*.json ./

# Install all dependencies (including dev dependencies for build)
# Puppeteer downloads its own compatible Chrome during npm ci
# into ~/.cache/puppeteer (PUPPETEER_CACHE_DIR)
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache
RUN npm ci && npm cache clean --force

# Copy worker source code
COPY worker/src ./src
COPY worker/tsconfig.json ./
COPY worker/nodemon.json ./

# Copy templates (needed for building generated apps)
COPY templates ./templates

# Install dependencies for react18-ts template (including dev dependencies for build tools)
RUN if [ -f "templates/react18-ts/package.json" ]; then \
        echo "Installing dependencies for templates/react18-ts"; \
        cd templates/react18-ts && npm ci && cd /app; \
    fi

# Create shared Vite cache directory
# Note: rolldown-vite handles dependency optimization automatically during builds
RUN mkdir -p /app/.vite-cache

# Build the TypeScript code
RUN npm run build

# Set NODE_ENV to production and remove development dependencies and source files
ENV NODE_ENV=production
RUN npm prune --production && \
    rm -rf src tsconfig.json nodemon.json

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs worker

# Create /tmp/apps directory with proper permissions for generated apps
RUN mkdir -p /tmp/apps && chown -R worker:nodejs /tmp/apps

# Ensure Puppeteer cache directory has proper permissions
RUN chown -R worker:nodejs /app/.puppeteer-cache /home/worker

# Change ownership of the app directory
RUN chown -R worker:nodejs /app
USER worker

# Expose the worker health check port
EXPOSE 3334

# Health check on worker port
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3334/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the worker
CMD ["npm", "start"]
