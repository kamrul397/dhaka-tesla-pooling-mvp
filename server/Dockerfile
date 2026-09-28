FROM node:22-alpine

WORKDIR /app

# Install dependencies with caching layer
COPY package*.json ./
RUN npm install

# Copy Prisma schema and generate native Linux client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy application source code and build TypeScript
COPY . .
RUN npm run build

EXPOSE 5000

# Automated schema migration, story cast seeding, and server start
CMD ["sh", "-c", "npx prisma db push && npx prisma db seed && npm run start"]
