# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production stage
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

RUN mkdir -p uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000
CMD ["node", "src/cluster.js"]
