package tw.basketball.magazine.publication.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.InetSocketAddress;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tw.basketball.magazine.media.MediaRevocationWorkerConfiguration;
import tw.basketball.magazine.media.application.MediaRevocationHandler;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxStatus;

final class PublicationWorkerConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PublicationWorkerConfiguration.class, MediaRevocationWorkerConfiguration.class)
            .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
            .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
            .withBean(ObjectMapper.class, () -> JsonMapper.builder().build());

    @Test
    void apiProfileDoesNotActivateInvalidationClient() {
        contextRunner.withPropertyValues("spring.profiles.active=api", "courtside.outbox.enabled=true")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(PublicationExternalInvalidator.class);
                });
    }

    @Test
    void disabledWorkerDoesNotActivateInvalidationClient() {
        contextRunner.withPropertyValues("spring.profiles.active=worker", "courtside.outbox.enabled=false")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(PublicationExternalInvalidator.class);
                });
    }

    @Test
    void unconfiguredWorkerKeepsTheExplicitFailClosedBoundary() {
        worker().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(PublicationJobHandler.class);
            assertThat(context).hasSingleBean(IssuePublicationJobHandler.class);
            assertThrows(IllegalStateException.class, () -> context.getBean(PublicationExternalInvalidator.class)
                    .invalidate(new PublicationExternalInvalidator.Request("job-fixture", List.of("issues"))));
        });
    }

    @Test
    void configuredWorkerCreatesTheOptInHttpAdapter() {
        worker().withPropertyValues(
                "courtside.publication.invalidation.endpoint=https://purge.example.test/invalidate",
                "courtside.publication.invalidation.bearer-token=local-test-only",
                "courtside.publication.invalidation.timeout=2s"
        ).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(PublicationExternalInvalidator.class))
                    .isInstanceOf(HttpPublicationExternalInvalidator.class);
        });
    }

    @Test
    void partiallyConfiguredWorkerFailsStartup() {
        worker().withPropertyValues("courtside.publication.invalidation.endpoint=https://purge.example.test/invalidate")
                .run(context -> assertThat(context).hasFailed());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void mediaRevocationUsesTheSharedConfiguredAdapterAfterReconciliationCommit(boolean configured) throws Exception {
        UUID assetId = UUID.randomUUID();
        UUID articleId = UUID.randomUUID();
        String key = "media-revocation:" + assetId;
        AtomicInteger providerCalls = new AtomicInteger();
        AtomicBoolean committed = new AtomicBoolean();
        AtomicBoolean providerSawCommit = new AtomicBoolean();
        AtomicReference<JsonNode> observed = new AtomicReference<>();
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> idempotencyHeader = new AtomicReference<>();
        ObjectMapper json = JsonMapper.builder().build();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/invalidate", exchange -> {
            providerCalls.incrementAndGet();
            providerSawCommit.set(committed.get());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            idempotencyHeader.set(exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            JsonNode request = json.readTree(exchange.getRequestBody().readAllBytes());
            observed.set(request);
            byte[] response = json.writeValueAsBytes(Map.of(
                    "status", "PURGED", "idempotencyKey", request.path("idempotencyKey").asString(),
                    "surrogateKeys", request.path("surrogateKeys")));
            try (exchange) {
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            }
        });
        server.start();
        try {
            ApplicationContextRunner runner = worker();
            if (configured) {
                runner = runner.withPropertyValues(
                        "courtside.publication.invalidation.endpoint=http://127.0.0.1:"
                                + server.getAddress().getPort() + "/invalidate",
                        "courtside.publication.invalidation.bearer-token=local-test-only");
            }
            runner.run(context -> {
                assertThat(context).hasNotFailed();
                JdbcTemplate jdbc = context.getBean(JdbcTemplate.class);
                PlatformTransactionManager transactions = context.getBean(PlatformTransactionManager.class);
                when(transactions.getTransaction(any(TransactionDefinition.class))).thenReturn(new SimpleTransactionStatus());
                doAnswer(invocation -> { committed.set(true); return null; })
                        .when(transactions).commit(any(TransactionStatus.class));
                when(jdbc.queryForObject(anyString(), eq(String.class), eq(assetId))).thenReturn("REVOKED");
                ResultSet impact = mock(ResultSet.class);
                when(impact.getString(1)).thenReturn("ARTICLE");
                when(impact.getObject(2, UUID.class)).thenReturn(articleId);
                doAnswer(invocation -> {
                    RowMapper<?> mapper = invocation.getArgument(1);
                    return List.of(mapper.mapRow(impact, 0));
                }).when(jdbc).query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<Object>>any(), eq(assetId));
                Instant now = Instant.parse("2026-09-09T00:00:00Z");
                OutboxEvent event = new OutboxEvent(UUID.randomUUID(), MediaRevocationHandler.EVENT_TYPE,
                        "MEDIA_ASSET", assetId, key, json.writeValueAsString(Map.of("assetId", assetId.toString())),
                        OutboxStatus.PENDING, now, 0, null, null, null, now, now, null, null);
                MediaRevocationHandler handler = context.getBean(MediaRevocationHandler.class);
                if (configured) {
                    handler.handle(event);
                    assertEquals(1, providerCalls.get());
                    assertTrue(providerSawCommit.get());
                    assertEquals("Bearer local-test-only", authorization.get());
                    assertEquals(key, idempotencyHeader.get());
                    assertEquals(json.valueToTree(Map.of("idempotencyKey", key, "surrogateKeys", List.of(
                            "article:" + articleId, "media:" + assetId, "offline:withdrawals",
                            "search:article:" + articleId, "sitemap:articles"))),
                            Objects.requireNonNull(observed.get(), "provider request"));
                } else {
                    OutboxHandlerException failure = assertThrows(OutboxHandlerException.class, () -> handler.handle(event));
                    assertTrue(failure.retryable());
                    assertTrue(committed.get());
                    assertEquals(0, providerCalls.get());
                }
            });
        } finally {
            server.stop(0);
        }
    }

    private ApplicationContextRunner worker() {
        return contextRunner.withPropertyValues("spring.profiles.active=worker", "courtside.outbox.enabled=true");
    }
}
