# syntax=docker/dockerfile:1.7

# S3Mock 5.1.0 is the latest released image. Build the pinned upstream
# 5.2.0 development line so its runtime dependency removals and updates are
# applied without depending on an unpublished mutable image tag.
FROM maven:3.9.14-eclipse-temurin-25@sha256:304ea1e9675d07612c36d5d70d8bd1dbd8aac64c307253bbde4e488857f90faa AS s3mock-build

ARG S3MOCK_COMMIT=627bf8d37938a5eb89e5775391c0b475c2686f98

RUN set -eux; \
    git init /src; \
    git -C /src remote add origin https://github.com/adobe/S3Mock.git; \
    git -C /src fetch --depth 1 origin "$S3MOCK_COMMIT"; \
    git -C /src checkout --detach FETCH_HEAD; \
    test "$(git -C /src rev-parse HEAD)" = "$S3MOCK_COMMIT"

WORKDIR /src

RUN mvn -B -ntp -pl server -am -DskipTests -DskipDocker=true package

RUN set -eux; \
    jar="$(find server/target -maxdepth 1 -type f -name 's3mock-*-exec.jar' -print -quit)"; \
    test -n "$jar"; \
    cp "$jar" /tmp/s3mock-exec.jar

# The final image keeps root so the Compose named volume can be initialized
# by the local stub; the build stage still verifies non-root execution.
USER nobody

FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS staging_area

RUN apk --no-cache add openjdk25-jdk openjdk25-jmods unzip

ENV JAVA_MINIMAL="/opt/java-minimal"

COPY --from=s3mock-build /tmp/s3mock-exec.jar s3mock.jar

ENV TMP_DIR="/tmp/app-jar"

RUN set -eux; \
    mkdir -p "$TMP_DIR"; \
    unzip -q s3mock.jar -d "$TMP_DIR"; \
    jdeps \
      --ignore-missing-deps \
      -q \
      --multi-release 25 \
      --print-module-deps \
      --recursive \
      --class-path "$TMP_DIR/BOOT-INF/lib/*:$TMP_DIR/BOOT-INF/classes:$TMP_DIR" \
      "$TMP_DIR/org" "$TMP_DIR/BOOT-INF/classes" "$TMP_DIR/BOOT-INF/lib/"*.jar > jre-deps.info; \
    jlink \
      --verbose \
      --add-modules "$(cat jre-deps.info)",jdk.crypto.ec \
      --compress 2 \
      --no-header-files \
      --no-man-pages \
      --strip-java-debug-attributes \
      --output "$JAVA_MINIMAL"

FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

ENV JAVA_HOME=/opt/java-minimal
ENV PATH="$PATH:$JAVA_HOME/bin"

COPY --from=staging_area "$JAVA_HOME" "$JAVA_HOME"
COPY --from=s3mock-build /tmp/s3mock-exec.jar /opt/s3mock.jar

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8
ENV root=/s3mockroot

EXPOSE 9090 9191 9092 9193

ENTRYPOINT ["java", "--illegal-access=warn", "-Djava.security.egd=file:/dev/./urandom", "-XX:+UseZGC", "-XX:+ZGenerational", "-jar", "/opt/s3mock.jar"]
