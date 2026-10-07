# Build the frontend with npm ci && npm run build before building this image.
# The runtime needs no npm dependencies: SQLite and HTTP are built into Node.
FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
WORKDIR /app
ENV NODE_ENV=production WINE_API_HOST=0.0.0.0 WINE_API_PORT=5180 WINE_DB_FILE=/data/wine-engine.sqlite
COPY dist ./dist
COPY package.json ./
COPY server ./server
COPY src/engine ./src/engine
RUN chmod -R a+rX /app && mkdir /data && chown node:node /data
USER node
EXPOSE 5180
VOLUME ["/data"]
CMD ["node", "server/index.js"]
