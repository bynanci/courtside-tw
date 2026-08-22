# syntax=docker/dockerfile:1.7

# The build invocation must supply an approved runtime image by immutable
# digest. There is intentionally no mutable default.
ARG WEB_RUNTIME_IMAGE
FROM ${WEB_RUNTIME_IMAGE}

ARG SOURCE_SHA
LABEL org.opencontainers.image.source="https://github.com/bynanci/courtside-tw" \
      org.opencontainers.image.revision="${SOURCE_SHA}" \
      org.opencontainers.image.title="Courtside TW Web"

WORKDIR /app
COPY --chown=10001:10001 apps/web/.output/ /app/

USER 10001:10001
EXPOSE 3000
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
ENTRYPOINT ["node", "server/index.mjs"]
