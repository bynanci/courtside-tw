package tw.basketball.magazine.shared.observability;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Set;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

final class ObservabilityMetricsTest {
    @Test
    void recordsBoundedOperationalSignalsWithoutSensitiveLabels() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CourtsideObservabilityMetrics metrics = new CourtsideObservabilityMetrics(
                registry,
                Set.of("/api/v1/articles/{slug}"),
                Set.of("rpc", "ipfs")
        );

        metrics.recordHttpRequest(
                "/api/v1/articles/{slug}",
                "GET",
                200,
                Duration.ofMillis(24)
        );
        metrics.recordHttpRequest(
                "/api/v1/articles/secret?email=editor@example.test",
                "GET",
                500,
                Duration.ofMillis(30)
        );
        metrics.recordMediaProcessing(
                "FAILED",
                "checksum",
                2048,
                0,
                Duration.ofMillis(40)
        );
        metrics.recordMediaProcessing(
                "FAILED",
                "private/originals/asset-secret",
                2048,
                0,
                Duration.ofMillis(40)
        );
        metrics.recordMotionLifecycle("dispose", true);
        metrics.recordProvenanceJob("VERIFIED", "rpc");
        metrics.recordProvenanceJob("FAILED", "wallet:0xdeadbeef");

        assertEquals(
                1.0,
                registry.get("courtside.http.server.requests")
                        .tag("route", "/api/v1/articles/{slug}")
                        .tag("status", "2xx")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.http.server.requests")
                        .tag("route", "unknown")
                        .tag("status", "5xx")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.media.processing")
                        .tag("outcome", "FAILED")
                        .tag("reason", "checksum")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.media.processing")
                        .tag("outcome", "FAILED")
                        .tag("reason", "unknown")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.motion.lifecycle")
                        .tag("signal", "dispose")
                        .tag("reduced_motion", "true")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.provenance.jobs")
                        .tag("state", "VERIFIED")
                        .tag("provider", "rpc")
                        .counter()
                        .count()
        );
        assertEquals(
                1.0,
                registry.get("courtside.provenance.jobs")
                        .tag("state", "unknown")
                        .tag("provider", "unknown")
                        .counter()
                        .count()
        );
        assertTrue(registry.find("email").meters().isEmpty());
        assertTrue(registry.find("storage").meters().isEmpty());
        assertTrue(registry.find("wallet").meters().isEmpty());
    }
}
