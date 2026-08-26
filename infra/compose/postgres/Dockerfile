# syntax=docker/dockerfile:1.7

# CVE-2025-68121 affects the gosu binary shipped by the upstream PostgreSQL image
# because it embeds an older Go standard library. Rebuild the same small helper
# from its pinned upstream source with a patched Go toolchain and x/sys version.
# The pinned builder also excludes the Go standard library versions flagged by
# CVE-2026-39821 and CVE-2026-46600 in the previous build stage.
FROM golang:1.27.0@sha256:65b6f280bf050ec5af12716857e8ea8439d694dbba8f31ceeb7630670071f2bb AS gosu-build

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

FROM postgres:18.6-alpine3.24@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2

# CVE-2026-14456 requires both Alpine OpenSSL libraries at 3.5.8-r0 or newer.
ARG OPENSSL_MINIMUM_VERSION=3.5.8-r0

COPY --from=gosu-build /out/gosu /usr/local/bin/gosu

RUN set -eux; \
    chmod 0755 /usr/local/bin/gosu; \
    apk add --no-cache --upgrade c-ares libcrypto3 libssl3; \
    for package in libcrypto3 libssl3; do \
      installed="$(apk list --installed "$package" 2>/dev/null | awk 'NR == 1 { print $1 }')"; \
      installed="${installed#${package}-}"; \
      test -n "$installed"; \
      test "$(apk version -t "$installed" "$OPENSSL_MINIMUM_VERSION")" != "<"; \
    done; \
    gosu --version; \
    gosu nobody true
