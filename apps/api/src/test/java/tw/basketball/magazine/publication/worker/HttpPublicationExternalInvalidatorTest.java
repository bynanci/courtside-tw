package tw.basketball.magazine.publication.worker;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

/** Real loopback protocol evidence, not a production provider purge receipt. */
final class HttpPublicationExternalInvalidatorTest {
    private static final String ACK = """
            {"status":"PURGED","idempotencyKey":"event-1","surrogateKeys":["article:1","sitemap:articles"]}
            """;
    private static final PublicationExternalInvalidator.Request REQUEST = new PublicationExternalInvalidator.Request(
            "event-1", List.of("article:1", "sitemap:articles")
    );
    private HttpServer server;
    private ExecutorService executor;
    private final AtomicInteger attempts = new AtomicInteger();

    @BeforeEach
    void startLoopbackProvider() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool();
        server.setExecutor(executor);
        server.start();
    }

    @AfterEach
    void stopLoopbackProvider() {
        server.stop(0);
        executor.shutdownNow();
    }

    @Test
    void sendsExactAuthenticatedIdempotentRequestAndAcceptsCompleteAcknowledgement() throws Exception {
        var observed = new AtomicReference<ObservedRequest>();
        serve(exchange -> {
            observed.set(new ObservedRequest(exchange.getRequestMethod(),
                    exchange.getRequestHeaders().getFirst("Authorization"),
                    exchange.getRequestHeaders().getFirst("Idempotency-Key"),
                    exchange.getRequestHeaders().getFirst("Content-Type"),
                    exchange.getRequestHeaders().getFirst("Accept"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            respond(exchange, 200, "application/json; charset=UTF-8", ACK);
        });
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            invalidator.invalidate(REQUEST);
            invalidator.invalidate(REQUEST);
        }
        assertEquals(2, attempts.get(), "Only the caller may choose to repeat the same durable operation");
        assertEquals("POST", observed.get().method());
        assertEquals("Bearer local-test-token", observed.get().authorization());
        assertEquals("event-1", observed.get().idempotencyKey());
        assertEquals("application/json", observed.get().contentType());
        assertEquals("application/json", observed.get().accept());
        var json = new JsonMapper();
        assertEquals(json.readTree("""
                {"idempotencyKey":"event-1","surrogateKeys":["article:1","sitemap:articles"]}
                """), json.readTree(observed.get().body()));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "null",
            "[]",
            "{}",
            "{",
            "{\"status\":\"ACCEPTED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-2\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"sitemap:articles\",\"article:1\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"article:1\",\"sitemap:articles\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"],\"extra\":true}",
            "{\"status\":\"ACCEPTED\",\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"],\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"]}",
            "{\"status\":\"PURGED\",\"idempotencyKey\":\"event-1\",\"surrogateKeys\":[\"article:1\",\"sitemap:articles\"]} {}"
    })
    void rejectsMalformedIncompleteAmbiguousAndMismatchedAcknowledgements(String body) {
        serve(exchange -> respond(exchange, 200, "application/json", body));
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
        }
        assertEquals(1, attempts.get());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"text/plain", "application/problem+json", "application/json; charset=latin1",
            "application/json, text/html", "application/json; nonsense"})
    void requiresOneValidJsonContentType(String contentType) {
        serve(exchange -> respond(exchange, 200, contentType, ACK));
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
        }
        assertEquals(1, attempts.get());
    }

    @Test
    void rejectsDuplicateContentTypeHeaders() {
        serve(exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            respond(exchange, 200, "application/json", ACK);
        });
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {202, 204, 400, 401, 429, 500, 503})
    void rejectsNon200WithoutRetryingOrLeakingProviderBody(int status) {
        serve(exchange -> respond(exchange, status, "application/json", "private-provider-error"));
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            var failure = assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
            assertFalse(failure.toString().contains("private-provider-error"));
            assertFalse(failure.toString().contains("local-test-token"));
            assertNull(failure.getCause());
        }
        assertEquals(1, attempts.get());
    }

    @Test
    void refusesRedirectWithoutSendingCredentialsToTheTarget() {
        var redirected = new AtomicInteger();
        server.createContext("/redirect-target", exchange -> {
            redirected.incrementAndGet();
            respond(exchange, 200, "application/json", ACK);
        });
        serve(exchange -> {
            exchange.getResponseHeaders().add("Location", endpoint("/redirect-target").toString());
            respond(exchange, 307, "application/json", ACK);
        });
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
        }
        assertEquals(1, attempts.get());
        assertEquals(0, redirected.get());
    }

    @Test
    void boundsAcknowledgementBytesEvenWithChunkedResponse() {
        serve(exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, 0);
            try (exchange) {
                exchange.getResponseBody().write((ACK + " ".repeat(16 * 1024)).getBytes(StandardCharsets.UTF_8));
            }
        });
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
        }
        assertEquals(1, attempts.get());
    }

    @Test
    void acceptsAcknowledgementAtTheExactByteLimit() {
        String body = ACK + " ".repeat(16 * 1024 - ACK.getBytes(StandardCharsets.UTF_8).length);
        serve(exchange -> respond(exchange, 200, "application/json", body));
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertDoesNotThrow(() -> invalidator.invalidate(REQUEST));
        }
    }

    @Test
    void rejectsNonUtf8BodyEvenWhenItsJsonWouldOtherwiseMatch() {
        serve(exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
            byte[] body = ACK.getBytes(StandardCharsets.UTF_16);
            try (exchange) {
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            }
        });
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
        }
        assertEquals(1, attempts.get());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void deadlineIncludesWaitingForHeadersAndForTheEntireBody(boolean sendHeaders) {
        var release = new CountDownLatch(1);
        var reached = new CountDownLatch(1);
        serve(exchange -> {
            try (exchange) {
                if (sendHeaders) {
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, 0);
                    exchange.getResponseBody().write('{');
                    exchange.getResponseBody().flush();
                }
                reached.countDown();
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        try (var invalidator = invalidator(Duration.ofMillis(300))) {
            assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
                assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
                assertTrue(reached.await(100, TimeUnit.MILLISECONDS), "The real provider accepted this HTTP attempt");
            });
        } finally {
            release.countDown();
        }
        assertEquals(1, attempts.get());
    }

    @Test
    void rejectsHeaderInjectionAndDuplicateRequestedKeysBeforeSending() {
        serve(exchange -> respond(exchange, 200, "application/json", ACK));
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(
                    new PublicationExternalInvalidator.Request("event\r\ninjected", List.of("article:1"))
            ));
            assertThrows(IllegalStateException.class, () -> invalidator.invalidate(
                    new PublicationExternalInvalidator.Request("event-1", List.of("article:1", "article:1"))
            ));
        }
        assertEquals(0, attempts.get());
    }

    @Test
    void failsAcknowledgementWithoutThrowingWhenSubscriptionIsMissing() throws Exception {
        var subscriber = acknowledgementSubscriber();
        assertDoesNotThrow(() -> subscriber.onNext(List.of(ByteBuffer.wrap(new byte[] {1}))));
        var failure = assertThrows(CompletionException.class, () -> subscriber.getBody().toCompletableFuture().join());
        assertEquals(IllegalStateException.class, failure.getCause().getClass());
        assertEquals("publication external invalidation provider acknowledgement subscription is unavailable",
                failure.getCause().getMessage());
        assertNull(failure.getCause().getCause());
    }

    @Test
    void cancelsTheActiveSubscriptionWithoutDemandingMoreOversizedAcknowledgementBytes() throws Exception {
        var subscriber = acknowledgementSubscriber();
        var requests = new AtomicInteger();
        var cancellations = new AtomicInteger();
        subscriber.onSubscribe(new Flow.Subscription() {
            @Override
            public void request(long count) {
                assertEquals(1, count);
                requests.incrementAndGet();
            }

            @Override
            public void cancel() {
                cancellations.incrementAndGet();
            }
        });
        subscriber.onNext(List.of(ByteBuffer.allocate(16 * 1024 + 1)));
        var failure = assertThrows(CompletionException.class, () -> subscriber.getBody().toCompletableFuture().join());
        assertEquals("publication external invalidation provider acknowledgement exceeds 16KiB",
                failure.getCause().getMessage());
        assertEquals(1, cancellations.get());
        assertEquals(1, requests.get(), "Oversized input must not request another response chunk");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void sanitizesSynchronousDispatchAndCancelledFutureFailures(boolean cancelledFuture) throws Exception {
        HttpClient client = mock(HttpClient.class);
        String privateDetails = "https://private-provider.example/secret-path local-test-token";
        if (cancelledFuture) {
            CompletableFuture<HttpResponse<byte[]>> cancelled = new CompletableFuture<>();
            cancelled.completeExceptionally(new CancellationException(privateDetails));
            when(client.sendAsync(any(HttpRequest.class),
                    org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any())).thenReturn(cancelled);
        } else {
            when(client.sendAsync(any(HttpRequest.class),
                    org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any()))
                    .thenThrow(new IllegalArgumentException(privateDetails));
        }
        try (var invalidator = invalidator(Duration.ofSeconds(3))) {
            // Fault injection is confined to the test: do not expose a production client override.
            invalidator.close();
            var field = HttpPublicationExternalInvalidator.class.getDeclaredField("client");
            field.setAccessible(true);
            field.set(invalidator, client);
            var failure = assertThrows(IllegalStateException.class, () -> invalidator.invalidate(REQUEST));
            assertEquals("publication external invalidation attempt failed or exceeded its deadline",
                    failure.getMessage());
            assertNull(failure.getCause());
            assertEquals(0, failure.getSuppressed().length);
        }
        assertEquals(0, attempts.get());
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse.BodySubscriber<byte[]> acknowledgementSubscriber() throws Exception {
        var constructor = Class.forName(HttpPublicationExternalInvalidator.class.getName()
                + "$BoundedAcknowledgementSubscriber").getDeclaredConstructor();
        constructor.setAccessible(true);
        return (HttpResponse.BodySubscriber<byte[]>) constructor.newInstance();
    }

    private void serve(HttpHandler handler) {
        server.createContext("/invalidate", exchange -> {
            attempts.incrementAndGet();
            handler.handle(exchange);
        });
    }

    private URI endpoint(String path) {
        return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + path);
    }

    private HttpPublicationExternalInvalidator invalidator(Duration timeout) {
        return new HttpPublicationExternalInvalidator(new PublicationInvalidationProperties(
                endpoint("/invalidate"), "local-test-token", timeout
        ));
    }

    private static void respond(HttpExchange exchange, int status, String contentType, String body) throws IOException {
        try (exchange) {
            if (contentType != null) {
                exchange.getResponseHeaders().add("Content-Type", contentType);
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, status == 204 ? -1 : bytes.length);
            if (status != 204) {
                exchange.getResponseBody().write(bytes);
            }
        }
    }

    private record ObservedRequest(String method, String authorization, String idempotencyKey,
            String contentType, String accept, String body) {
    }
}
