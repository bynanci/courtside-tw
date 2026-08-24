package tw.basketball.magazine.shared.observability;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

final class OpenTelemetryConfigurationContractTest {
    @Test
    void usesSpringBootOtelBridgeWithoutExporterActivation() throws IOException {
        Path repositoryRoot = Path.of(System.getProperty("courtside.repoRoot", "."));
        String build = Files.readString(repositoryRoot.resolve("apps/api/build.gradle.kts"));
        String configuration = Files.readString(
                repositoryRoot.resolve("apps/api/src/main/resources/application.yml")
        );

        assertTrue(build.contains(
                "implementation(\"org.springframework.boot:spring-boot-micrometer-tracing-opentelemetry:"
        ));
        assertFalse(build.contains("opentelemetry-exporter"));
        assertTrue(configuration.contains("COURTSIDE_OTEL_ENABLED:false"));
        assertTrue(configuration.contains("COURTSIDE_OTEL_SAMPLING_PROBABILITY:0.0"));
    }
}
