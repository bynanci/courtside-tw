# syntax=docker/dockerfile:1.7

# The build invocation must supply an approved runtime image by immutable
# digest. There is intentionally no mutable default.
ARG API_RUNTIME_IMAGE
FROM ${API_RUNTIME_IMAGE}

ARG SOURCE_SHA
LABEL org.opencontainers.image.source="https://github.com/bynanci/courtside-tw" \
      org.opencontainers.image.revision="${SOURCE_SHA}" \
      org.opencontainers.image.title="Courtside TW API"

WORKDIR /app
COPY --chown=10001:10001 apps/api/build/libs/courtside-tw-api-0.1.0-SNAPSHOT.jar /app/api.jar

USER 10001:10001
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=api
ENTRYPOINT ["java", "-jar", "/app/api.jar"]
