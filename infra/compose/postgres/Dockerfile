# syntax=docker/dockerfile:1.7

# CVE-2025-68121 affects the gosu binary shipped by the upstream PostgreSQL image
# because it embeds an older Go standard library. Rebuild the same small helper
# from its pinned upstream source with a patched Go toolchain and x/sys version.
FROM golang:1.25.12@sha256:fe5d57d3b718e7a4986bae156c2d73f44973bfd313073aed08a4de6692bb6161 AS gosu-build

ARG GOSU_COMMIT=40506998e34a7a679e6dae41374c1b7aa37eb73f
ARG GOSU_X_SYS_VERSION=0.44.0
ARG TARGETOS=linux
ARG TARGETARCH=amd64

RUN set -eux; \
    git init /src; \
    git -C /src remote add origin https://github.com/tianon/gosu.git; \
    git -C /src fetch --depth 1 origin "$GOSU_COMMIT"; \
    git -C /src checkout --detach FETCH_HEAD; \
    test "$(git -C /src rev-parse HEAD)" = "$GOSU_COMMIT"

WORKDIR /src

RUN set -eux; \
    go mod edit -require="golang.org/x/sys@v$GOSU_X_SYS_VERSION"; \
    go mod tidy; \
    CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" \
      go build -trimpath -buildvcs=false -ldflags='-d -w' -o /out/gosu .; \
    chmod 0755 /out/gosu; \
    /out/gosu --version

# The official PostgreSQL entrypoint must start as root to initialize the
# mounted data directory, then drops privileges through gosu.
USER nobody

FROM postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15

COPY --from=gosu-build /out/gosu /usr/local/bin/gosu

RUN set -eux; \
    chmod 0755 /usr/local/bin/gosu; \
    apk add --no-cache --upgrade c-ares; \
    gosu --version; \
    gosu nobody true
