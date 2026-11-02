FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

COPY package.json ./
COPY tools ./tools
COPY public ./public
COPY server ./server

# PNG icons are generated here; /data is owned by the unprivileged user so a fresh
# named volume inherits the right permissions.
RUN node tools/make-icons.mjs \
 && mkdir -p /data \
 && chown node:node /data

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
