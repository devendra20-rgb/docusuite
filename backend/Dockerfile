# -------------------------------------------------------------
# DocuSuite - Multi-Stage Production Dockerfile
# Packages Node.js, Headless LibreOffice, QPDF, and Ghostscript
# -------------------------------------------------------------

# Stage 1: Build Application
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code and build
COPY src/ ./src/
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-bookworm-slim AS runner

LABEL maintainer="DocuSuite Engineering"
LABEL description="DocuSuite Brand-Neutral Document Processing Engine"

# Install system dependencies: LibreOffice headless, QPDF, Ghostscript & standard typography
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-core \
    qpdf \
    ghostscript \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto-color-emoji \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV STORAGE_LOCAL_ROOT=/app/storage
ENV TEMP_DIR=/app/storage/temp
ENV OUTPUT_DIR=/app/storage/outputs
ENV SOFFICE_PATH=/usr/bin/soffice
ENV QPDF_PATH=/usr/bin/qpdf
ENV GS_PATH=/usr/bin/gs

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled TypeScript dist from builder
COPY --from=builder /app/dist ./dist

# Create storage directory structure and configure permissions
RUN mkdir -p /app/storage/temp /app/storage/outputs \
    && chown -R node:node /app

# Switch to non-root user
USER node

EXPOSE 4000

# Container healthcheck targeting /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# Default command starts the API server
CMD ["node", "dist/server.js"]
