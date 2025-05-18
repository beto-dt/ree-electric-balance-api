FROM node:16-alpine AS builder
WORKDIR /app

RUN apk --no-cache add python3 make g++ curl

COPY package*.json ./

RUN npm ci --only=production

FROM node:16-alpine

LABEL maintainer="Luis Alberto De La Torre<luis.atorred24@gmail.com>"
LABEL description="API para balance eléctrico de REE con GraphQL"
LABEL version="1.0.0"

ENV NODE_ENV=production \
    PORT=4000 \
    TZ=Europe/Madrid

WORKDIR /app

RUN apk --no-cache add curl tzdata \
    && cp /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && apk del tzdata

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

RUN mkdir -p /app/logs

COPY --from=builder /app/node_modules /app/node_modules

COPY . .

RUN if [ -d "/app/scripts" ]; then \
      chmod +x /app/scripts/*.js || echo "No scripts to make executable"; \
    else \
      echo "Scripts directory does not exist"; \
    fi

RUN chown -R nodejs:nodejs /app

RUN npm --version && \
    node --version

EXPOSE $PORT

USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

CMD ["node", "src/index.js"]
