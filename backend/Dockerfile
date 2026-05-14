# ==========================================
# AI Chat Backend - Dockerfile
# Multi-stage build for production
# ==========================================

# ==========================================
# Stage 1: Dependencies (Node 20 for Prisma)
# ==========================================
FROM node:20-alpine AS deps

RUN apk add --no-cache dumb-init curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (ignore engine check for compatibility)
RUN npm install --production --ignore-scripts && npm cache clean --force

# ==========================================
# Stage 2: Builder
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for installation
COPY package*.json ./

# Install all dependencies (ignore scripts for Prisma)
RUN npm install --ignore-scripts && npm cache clean --force

# Copy source code
COPY src ./src

# ==========================================
# Stage 3: Production
# ==========================================
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies and source from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Create necessary directories for non-root user
RUN mkdir -p /app/logs /app/data && chown -R nodejs:nodejs /app

# Set environment
ENV NODE_ENV=production
ENV PORT=30000

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 30000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:30000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]