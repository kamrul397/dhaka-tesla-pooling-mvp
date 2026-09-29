FROM node:22-alpine

WORKDIR /app

# Configure npm network resilience (prevent ETIMEDOUT on slow/laggy connections)
RUN npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 120000 \
    && npm config set fetch-retries 5

COPY package*.json ./
RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["sh", "-c", "npx prisma db push && npx prisma db seed && npm run start"]
