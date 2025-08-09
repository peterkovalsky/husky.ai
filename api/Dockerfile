# Use Node.js 22 LTS Alpine for smaller image size
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++

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

# Install dependencies for templates folder
RUN if [ -f "templates/package.json" ]; then \
        echo "Installing dependencies for templates"; \
        cd templates && npm ci --only=production && cd /app; \
    fi

# Install dependencies for react18-ts template
RUN if [ -f "templates/react18-ts/package.json" ]; then \
        echo "Installing dependencies for templates/react18-ts"; \
        cd templates/react18-ts && npm ci --only=production && cd /app; \
    fi

# Build the TypeScript code
RUN npm run build

# Remove development dependencies and source files but keep apps folder
RUN npm prune --production && \
    rm -rf src tsconfig.json jest.config.js nodemon.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose the port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3333/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]