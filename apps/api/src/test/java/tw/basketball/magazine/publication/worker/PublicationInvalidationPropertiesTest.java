package tw.basketball.magazine.publication.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

final class PublicationInvalidationPropertiesTest {
    @Test
    void absentEndpointRemainsUnconfiguredWithThreeSecondDefault() {
        var properties = new PublicationInvalidationProperties(null, null, null);
        assertFalse(properties.configured());
        assertEquals(Duration.ofSeconds(3), properties.timeout());
        assertThrows(IllegalArgumentException.class, () -> new HttpPublicationExternalInvalidator(properties));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://purge.example.test/invalidate",
            "https://purge.example.test:8443/invalidate",
            "http://127.0.0.1:8080/invalidate",
            "http://[::1]:8080/invalidate"
    })
    void allowsHttpsOrExplicitLoopbackHttp(String endpoint) {
        var properties = new PublicationInvalidationProperties(URI.create(endpoint), "test-token", null);
        assertTrue(properties.configured());
        assertEquals(URI.create(endpoint), properties.endpoint());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "http://purge.example.test/invalidate",
            "http://localhost:8080/invalidate",
            "http://127.1:8080/invalidate",
            "http://127.0.0.2:8080/invalidate",
            "http://[::ffff:127.0.0.1]:8080/invalidate",
            "https://user:password@purge.example.test/invalidate",
            "https://purge.example.test/invalidate?token=secret",
            "https://purge.example.test/invalidate#secret",
            "https://purge.example.test:0/invalidate",
            "https://purge.example.test:65536/invalidate",
            "/invalidate",
            "file:///invalidate"
    })
    void rejectsUnsafeOrAmbiguousEndpoints(String endpoint) {
        assertThrows(IllegalArgumentException.class, () -> new PublicationInvalidationProperties(
                URI.create(endpoint), "test-token", null
        ));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "token with space", "Bearer token", "token\nheader", "token=middle", "秘密"})
    void configuredEndpointRequiresAValidBearerToken(String token) {
        assertThrows(IllegalArgumentException.class, () -> new PublicationInvalidationProperties(
                URI.create("https://purge.example.test/invalidate"), token, null
        ));
    }

    @Test
    void rejectsOversizedTokenAndTokenWithoutEndpoint() {
        assertThrows(IllegalArgumentException.class, () -> new PublicationInvalidationProperties(
                URI.create("https://purge.example.test/invalidate"), "a".repeat(4097), null
        ));
        assertThrows(IllegalArgumentException.class, () -> new PublicationInvalidationProperties(
                null, "test-token", null
        ));
    }

    @ParameterizedTest
    @MethodSource("invalidTimeouts")
    void rejectsTimeoutOutsideTheBoundedAttemptWindow(Duration timeout) {
        assertThrows(IllegalArgumentException.class, () -> new PublicationInvalidationProperties(null, null, timeout));
    }

    private static Stream<Duration> invalidTimeouts() {
        return Stream.of(Duration.ZERO, Duration.ofSeconds(-1), Duration.ofMillis(99),
                Duration.ofSeconds(5).plusNanos(1), Duration.ofDays(1));
    }

    @Test
    void acceptsBothTimeoutBoundariesAndRedactsSecretsFromDiagnostics() {
        for (Duration timeout : List.of(Duration.ofMillis(100), Duration.ofSeconds(5))) {
            var properties = new PublicationInvalidationProperties(
                    URI.create("https://purge.example.test/private-endpoint"), "secret-token", timeout
            );
            assertEquals(timeout, properties.timeout());
            assertThat(properties.toString()).contains("[REDACTED]")
                    .doesNotContain("secret-token", "private-endpoint");
        }
    }

    @Test
    void missingCredentialFailsPropertyBindingAtStartup() {
        new ApplicationContextRunner().withUserConfiguration(TestConfiguration.class)
                .withPropertyValues("courtside.publication.invalidation.endpoint=https://purge.example.test/invalidate")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void bindsExplicitOptInAndTimeout() {
        new ApplicationContextRunner().withUserConfiguration(TestConfiguration.class)
                .withPropertyValues(
                        "courtside.publication.invalidation.endpoint=http://127.0.0.1:8080/invalidate",
                        "courtside.publication.invalidation.bearer-token=local-test-token",
                        "courtside.publication.invalidation.timeout=750ms"
                ).run(context -> {
                    assertThat(context).hasNotFailed();
                    var properties = context.getBean(PublicationInvalidationProperties.class);
                    assertTrue(properties.configured());
                    assertEquals(Duration.ofMillis(750), properties.timeout());
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(PublicationInvalidationProperties.class)
    static class TestConfiguration {
    }
}
