package tw.basketball.magazine.publication.worker;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * One bounded HTTP attempt. The durable outbox owns retries, and only a complete,
 * exact acknowledgement proves that this attempt purged the requested keys.
 */
public final class HttpPublicationExternalInvalidator
        implements PublicationExternalInvalidator, AutoCloseable {
    private static final int MAXIMUM_ACK_BYTES = 16 * 1024;
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .build();

    private final PublicationInvalidationProperties properties;
    private final HttpClient client;

    public HttpPublicationExternalInvalidator(PublicationInvalidationProperties properties) {
        this.properties = Objects.requireNonNull(properties, "properties");
        if (!properties.configured()) {
            throw new IllegalArgumentException("invalidation endpoint is not configured");
        }
        this.client = HttpClient.newBuilder()
                .connectTimeout(properties.timeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    @Override
    public void invalidate(Request request) {
        Objects.requireNonNull(request, "request");
        if (request.idempotencyKey().length() > 256
                || !request.idempotencyKey().matches("[\\x21-\\x7E]+")
                || new HashSet<>(request.surrogateKeys()).size() != request.surrogateKeys().size()) {
            throw failure("request is invalid");
        }
        CompletableFuture<HttpResponse<byte[]>> attempt = null;
        long startedAt = System.nanoTime();
        try {
            HttpRequest httpRequest = HttpRequest.newBuilder(properties.endpoint())
                    .timeout(properties.timeout())
                    .header("Authorization", "Bearer " + properties.bearerToken())
                    .header("Idempotency-Key", request.idempotencyKey())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(JSON.writeValueAsBytes(Map.of(
                            "idempotencyKey", request.idempotencyKey(),
                            "surrogateKeys", request.surrogateKeys()
                    ))))
                    .build();
            attempt = client.sendAsync(httpRequest, response -> {
                if (response.statusCode() != 200 || !hasJsonContentType(response)) {
                    throw failure("provider did not return an HTTP 200 JSON acknowledgement");
                }
                return new BoundedAcknowledgementSubscriber();
            });
            long remaining = properties.timeout().toNanos() - (System.nanoTime() - startedAt);
            byte[] acknowledgement = attempt.get(Math.max(0, remaining), TimeUnit.NANOSECONDS).body();
            verifyAcknowledgement(acknowledgement, request);
            if (System.nanoTime() - startedAt > properties.timeout().toNanos()) {
                throw failure("attempt exceeded its deadline");
            }
        } catch (InterruptedException exception) {
            if (attempt != null) {
                attempt.cancel(true);
            }
            Thread.currentThread().interrupt();
            throw failure("attempt was interrupted");
        } catch (ExecutionException | TimeoutException | RuntimeException exception) {
            if (attempt != null) {
                attempt.cancel(true);
            }
            // Do not propagate provider body, URI, or HTTP exception details into outbox logs.
            throw failure("attempt failed or exceeded its deadline");
        }
    }

    @Override
    public void close() {
        client.shutdownNow();
    }

    private static boolean hasJsonContentType(HttpResponse.ResponseInfo response) {
        List<String> values = response.headers().allValues("Content-Type");
        return values.size() == 1 && values.getFirst().matches(
                "(?i)application/json(?:\\s*;\\s*charset\\s*=\\s*(?:utf-8|\"utf-8\"))?\\s*"
        );
    }

    private static void verifyAcknowledgement(byte[] body, Request request) {
        JsonNode acknowledgement;
        try {
            String json = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(body)).toString();
            acknowledgement = JSON.readTree(json);
        } catch (CharacterCodingException | RuntimeException exception) {
            throw failure("provider acknowledgement is not valid JSON");
        }
        JsonNode expected = JSON.valueToTree(Map.of(
                "status", "PURGED",
                "idempotencyKey", request.idempotencyKey(),
                "surrogateKeys", request.surrogateKeys()
        ));
        if (!expected.equals(acknowledgement)) {
            throw failure("provider acknowledgement does not match the requested purge");
        }
    }

    private static IllegalStateException failure(String reason) {
        return new IllegalStateException("publication external invalidation " + reason);
    }

    private static final class BoundedAcknowledgementSubscriber
            implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> body = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;

        @Override
        public CompletionStage<byte[]> getBody() {
            return body.minimalCompletionStage();
        }

        @Override
        public void onSubscribe(Flow.Subscription newSubscription) {
            if (subscription != null) {
                newSubscription.cancel();
                return;
            }
            subscription = newSubscription;
            subscription.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            Flow.Subscription current = subscription;
            if (current == null) {
                body.completeExceptionally(failure("provider acknowledgement subscription is unavailable"));
                return;
            }
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAXIMUM_ACK_BYTES - bytes.size()) {
                    current.cancel();
                    body.completeExceptionally(failure("provider acknowledgement exceeds 16KiB"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            current.request(1);
        }

        @Override
        public void onError(Throwable failure) {
            body.completeExceptionally(failure);
        }

        @Override
        public void onComplete() {
            body.complete(bytes.toByteArray());
        }
    }
}
