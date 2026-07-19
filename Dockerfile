FROM node:24-alpine AS build
WORKDIR /app
# Electron is a devDependency only needed for desktop mode; skip its binary download
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:24-alpine
WORKDIR /app
# tzdata so the TZ env var (set in docker-compose) actually takes effect;
# without it Alpine silently stays on UTC and Excel dates parsed at
# midnight server-time shift into the previous day/month in the browser.
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    RENDERER_ROOT=/app/renderer \
    APP_DATA_DIR=/data/app \
    PORT=3737
COPY --from=build /app/out/renderer ./renderer
COPY --from=build /app/out/server ./server
RUN mkdir -p /data/app && chown -R node:node /data/app /app
USER node
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3737/api/health || exit 1
CMD ["node", "server/index.js"]
