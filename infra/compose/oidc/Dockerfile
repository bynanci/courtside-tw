# syntax=docker/dockerfile:1.7

# The upstream 6.0.1 test image currently contains BusyBox 1.37.0-r61,
# which is flagged by CVE-2026-38753 and CVE-2026-38754. Keep the
# application version and upstream content fixed while upgrading the Wolfi
# package, then return to the upstream non-root runtime identity.
FROM ghcr.io/navikt/mock-oauth2-server:6.0.1@sha256:b97e48a499d312631206d166e2f2266adb9af34ef8b411dba9b15e48c6dc0dbe

ARG BUSYBOX_MINIMUM_VERSION=1.38.0-r0

USER root
RUN set -eux; \
    apk add --no-cache --upgrade busybox; \
    installed="$(apk list --installed busybox 2>/dev/null | awk 'NR == 1 { print $1 }')"; \
    installed="${installed#busybox-}"; \
    test -n "$installed"; \
    test "$(apk version -t "$installed" "$BUSYBOX_MINIMUM_VERSION")" != "<"

USER 65532
