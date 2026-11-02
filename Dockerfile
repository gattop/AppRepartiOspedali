FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    BACKUP_DIR=/backup \
    BACKUPS_TO_KEEP=3

WORKDIR /app

RUN apk add --no-cache su-exec

COPY package.json docker-entrypoint.sh ./
COPY tools ./tools
COPY public ./public
COPY server ./server

# PNG icons are generated at build time, so no binaries live in the repo.
RUN node tools/make-icons.mjs \
 && chmod +x docker-entrypoint.sh \
 && mkdir -p /data

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

# The entrypoint fixes /data ownership and then drops to the "node" user.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
