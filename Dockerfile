FROM node:20-bookworm-slim

# App setup
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Install production dependencies using lockfile
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Copy application source
COPY . .

# Ensure runtime directories exist and are writable
RUN mkdir -p apps data logs backups && \
    chown -R node:node /usr/src/app

# Drop privileges
USER node

# Default port used by the app
ENV PORT=5050
EXPOSE 5050

# Start the server
CMD ["node", "server.js"]

