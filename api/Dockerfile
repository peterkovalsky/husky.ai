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
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configure Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install TypeScript and Vite globally for building generated apps
RUN npm install -g typescript vite

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code and templates
COPY src ./src
COPY tsconfig.json ./
COPY jest.config.js ./
COPY nodemon.json ./
COPY templates ./templates

# Install dependencies for react18-ts template (including dev dependencies for build tools)
RUN if [ -f "templates/react18-ts/package.json" ]; then \
        echo "Installing dependencies for templates/react18-ts"; \
        cd templates/react18-ts && npm ci && cd /app; \
    fi

# Build the TypeScript code
RUN npm run build

# Set NODE_ENV to production and remove development dependencies and source files
ENV NODE_ENV=production
RUN npm prune --production && \
    rm -rf src tsconfig.json jest.config.js nodemon.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Create /tmp/apps directory with proper permissions for generated apps
RUN mkdir -p /tmp/apps && chown -R nextjs:nodejs /tmp/apps

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose the port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3333/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]