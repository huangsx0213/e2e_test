# Stage 1: Build
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
# Install all dependencies for build
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime
# Use Playwright's official image which includes all browser dependencies
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7860
# Ensure Playwright browsers are found in the default location
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy build artifacts
COPY --from=builder /app/dist ./dist
# Copy seed data for runtime seeding
COPY --from=builder /app/server/migrations/seed_data.json ./server/migrations/seed_data.json

# Hugging Face Spaces runs as user 1000, ensure permissions
# Create a writable directory for videos and the SQLite database
RUN mkdir -p /app/videos && chmod -R 777 /app
RUN chmod -R 777 /ms-playwright

# Expose the default Hugging Face Space port
EXPOSE 7860

# Start the application
CMD ["node", "dist/server.cjs"]
