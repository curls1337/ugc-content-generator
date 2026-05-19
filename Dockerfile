FROM node:20-slim

# Install Playwright dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    fonts-liberation wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all package files first for better caching
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build client (Vite produces static files in client/dist)
RUN npm run build:client

# Install Playwright Chromium
RUN npx playwright install chromium

# Expose port
ENV PORT=8080
EXPOSE 8080

# Start server with tsx (serves API + static client files)
CMD ["npx", "tsx", "server/src/index.ts"]
