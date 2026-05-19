FROM node:20-slim

# Install Playwright dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    fonts-liberation wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Install root dependencies
RUN npm install

# Install client dependencies
WORKDIR /app/client
RUN npm install

# Install server dependencies
WORKDIR /app/server
RUN npm install

# Build client with Vite only (skip tsc)
WORKDIR /app/client
RUN npx vite build

# Install Playwright Chromium
WORKDIR /app
RUN npx playwright install chromium

# Expose port
ENV PORT=8080
EXPOSE 8080

WORKDIR /app

# Start server with tsx using tsconfig paths
CMD ["npx", "tsx", "--tsconfig", "server/tsconfig.json", "server/src/index.ts"]
