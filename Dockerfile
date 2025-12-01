FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files first
COPY backend/package.json ./
COPY backend/package-lock.json* ./

# Install dependencies
RUN npm ci --only=production || npm install --production

# Copy backend application code
COPY backend/server.js ./
COPY backend/*.js ./

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
