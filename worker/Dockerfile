# Use Node.js 22 LTS Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for native modules and Chromium for Puppeteer
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    udev \
    ttf-dejavu \
    fontconfig \
    dbus

# Configure Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install TypeScript and Vite globally for building generated apps
RUN npm install -g typescript vite

# Copy worker package files
# Build context is husky.ai root: docker build -f worker/Dockerfile .
COPY worker/package*.json ./

# Install all dependencies (including dev dependencies for build)
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

# Pre-warm Vite cache during image build
# This bakes the dependency pre-bundling into the image so first builds are fast
RUN mkdir -p /tmp/.vite-cache && \
    if [ -d "templates/react18-ts/node_modules" ]; then \
        echo "Pre-warming Vite cache from template..."; \
        cd templates/react18-ts && \
        VITE_CACHE_DIR=/tmp/.vite-cache npx vite optimize && \
        cd /app; \
        echo "Vite cache pre-warmed successfully"; \
    fi

# Build the TypeScript code
RUN npm run build

# Set NODE_ENV to production and remove development dependencies and source files
ENV NODE_ENV=production
RUN npm prune --production && \
    rm -rf src tsconfig.json nodemon.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S worker -u 1001

# Create /tmp/apps directory with proper permissions for generated apps
# Also ensure Vite cache directory has proper permissions
RUN mkdir -p /tmp/apps && chown -R worker:nodejs /tmp/apps && \
    chown -R worker:nodejs /tmp/.vite-cache

# Create Chromium cache directory with proper permissions
RUN mkdir -p /home/worker/.cache/puppeteer && chown -R worker:nodejs /home/worker

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
