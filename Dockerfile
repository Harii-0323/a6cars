FROM node:18-alpine

# Force rebuild trigger - timestamp: 2025-12-01T12:30:00Z
WORKDIR /usr/src/app

# Copy package files first
COPY backend/package.json ./
COPY backend/package-lock.json* ./

# Install production dependencies (use npm install to avoid lockfile mismatches)
RUN npm install --production --no-audit --no-fund

# Copy backend application code (after install to keep dependency layer cached)
COPY backend/ ./

# Create uploads directory
RUN mkdir -p uploads

# Port configuration for Render
ENV PORT=10000
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start application directly with node
CMD ["node", "--enable-source-maps", "server.js"]
