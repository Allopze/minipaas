# Build stage for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Production stage
FROM node:18-alpine

# Install Java for Minecraft servers
RUN apk add --no-cache openjdk17-jre-headless

WORKDIR /app

# Copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

COPY backend/ ./backend/

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directories
RUN mkdir -p backend/data/servers backend/data/backups backend/data/temp

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Run as non-root user
RUN addgroup -g 1001 -S minichunk && \
    adduser -S minichunk -u 1001 -G minichunk && \
    chown -R minichunk:minichunk /app

USER minichunk

CMD ["node", "backend/src/index.js"]
