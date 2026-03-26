FROM node:20-slim

# Install Playwright Chromium and its system dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

CMD ["npx", "tsx", "src/index.ts"]
