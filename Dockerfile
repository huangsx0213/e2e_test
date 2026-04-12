# Stage 1: Build
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
# Install all dependencies for build
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime
# Use Noble (Ubuntu 24.04) based Playwright image
FROM mcr.microsoft.com/playwright:v1.50.0-noble
WORKDIR /app

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=7860
ENV HEADLESS=true
# Playwright specific ENV
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy build artifacts
COPY --from=builder /app/dist ./dist
# Important for initialization
COPY --from=builder /app/server/migrations ./server/migrations

# Hugging Face Spaces runs as user 1000 (standard for safety)
# Create necessary directories and set wide permissions for portability
RUN mkdir -p /app/videos /app/db && chmod -R 777 /app
# Pre-create the sqlite database file with open permissions so the runtime user can write to it
RUN touch /app/database.sqlite && chmod 777 /app/database.sqlite

# Hugging Face Spaces metadata
LABEL maintainer="Antigravity"
LABEL description="QuantumQA E2E Matrix - Unified Recording Engine"

# Expose the default Hugging Face Space port
EXPOSE 7860

# Start the application using node directly for better signal handling in Docker
CMD ["node", "dist/server.cjs"]
