FROM node:22-alpine

WORKDIR /app

# Configure npm network resilience
RUN npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 120000 \
    && npm config set fetch-retries 5

COPY package*.json ./
RUN npm install

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
