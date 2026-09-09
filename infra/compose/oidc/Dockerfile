# syntax=docker/dockerfile:1.7

# Keep the upstream 6.0.2 test image and its immutable digest fixed while
# upgrading the Wolfi packages required by the security gate. This keeps the
# OIDC test surface attributable to the pinned upstream application image.
FROM ghcr.io/navikt/mock-oauth2-server:6.0.2@sha256:b538810afd589d42fbfb856c588c2065eaeed1dc528d6c532972048e67fc2aff

ARG BUSYBOX_MINIMUM_VERSION=1.38.0-r0
# CVE-2026-14456 is remediated by the 3.6.3-r5 package floor.
ARG OPENSSL_MINIMUM_VERSION=3.6.3-r5

USER root
RUN set -eux; \
    apk add --no-cache --upgrade busybox libcrypto3 libssl3; \
    installed="$(apk list --installed busybox 2>/dev/null | awk 'NR == 1 { print $1 }')"; \
    installed="${installed#busybox-}"; \
    test -n "$installed"; \
    test "$(apk version -t "$installed" "$BUSYBOX_MINIMUM_VERSION")" != "<"; \
    for package in libcrypto3 libssl3; do \
      installed="$(apk list --installed "$package" 2>/dev/null | awk 'NR == 1 { print $1 }')"; \
      installed="${installed#${package}-}"; \
      test -n "$installed"; \
      test "$(apk version -t "$installed" "$OPENSSL_MINIMUM_VERSION")" != "<"; \
    done

USER 65532
