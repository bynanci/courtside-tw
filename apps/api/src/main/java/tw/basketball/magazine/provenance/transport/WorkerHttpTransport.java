package tw.basketball.magazine.provenance.transport;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

/** Bounded worker-only HTTP. No redirects or provider error bodies escape this boundary. */
public final class WorkerHttpTransport {
    private static final int MAX_RESPONSE_BYTES = 160_000;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final Set<String> approvedHosts;
    private final boolean loopbackTest;
    public WorkerHttpTransport(Set<String> approvedHosts, boolean loopbackTest) {
        this.approvedHosts = Set.copyOf(approvedHosts);
        this.loopbackTest = loopbackTest;
    }
    public byte[] request(String method, URI uri, String contentType, byte[] body, Map<String, String> headers) {
        if (uri.getHost() == null || !approvedHosts.contains(uri.getHost()) || uri.getUserInfo() != null
                || uri.getFragment() != null || !("https".equals(uri.getScheme())
                || (loopbackTest && "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())))) {
            throw new IllegalArgumentException("unapproved provider destination");
        }
        HttpRequest.Builder request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json").header("Content-Type", contentType)
                .method(method, body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(request::header);
        try {
            HttpResponse<byte[]> response = client.send(request.build(), ignored -> new BoundedBody());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("provider unavailable");
            }
            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("provider request interrupted", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("provider transport unavailable", exception);
        }
    }
    private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription incoming) {
            subscription = incoming;
            incoming.request(1);
        }
        @Override public void onNext(List<ByteBuffer> items) {
            for (ByteBuffer item : items) {
                if (item.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    java.util.Objects.requireNonNull(subscription).cancel();
                    result.completeExceptionally(new IOException("provider response exceeds bound"));
                    return;
                }
                byte[] chunk = new byte[item.remaining()];
                item.get(chunk);
                bytes.writeBytes(chunk);
            }
            java.util.Objects.requireNonNull(subscription).request(1);
        }
        @Override public void onError(Throwable failure) { result.completeExceptionally(failure); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
