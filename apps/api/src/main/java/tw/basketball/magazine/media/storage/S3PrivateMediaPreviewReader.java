package tw.basketball.magazine.media.storage;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Path-style SigV4 GET for server-owned private original keys; no SDK or public signed URLs. */
public final class S3PrivateMediaPreviewReader implements PrivateMediaPreviewReader {
    private static final String EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    private static final DateTimeFormatter AMZ_DATE = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private final URI endpoint;
    private final String bucket;
    private final String region;
    private final String accessKey;
    private final String secretKey;
    private final String sessionToken;
    private final Clock clock;
    private final HttpClient client;

    public S3PrivateMediaPreviewReader(
            URI endpoint, String bucket, String region, String accessKey, String secretKey,
            String sessionToken, boolean allowLocalHttp, Clock clock
    ) {
        this.endpoint = validateEndpoint(endpoint, allowLocalHttp);
        this.bucket = requirePattern(bucket, "[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]");
        this.region = requirePattern(region, "[a-z0-9][a-z0-9-]{1,62}");
        this.accessKey = requirePattern(accessKey, "[A-Za-z0-9_-]{1,128}");
        this.secretKey = boundedSecret(secretKey, false);
        this.sessionToken = boundedSecret(sessionToken, true);
        this.clock = Objects.requireNonNull(clock, "clock");
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    @Override
    public byte[] read(String privateStorageKey, int maximumBytes) throws IOException {
        if (maximumBytes < 1 || maximumBytes > StorageUploadPolicy.MAXIMUM_ORIGINAL_BYTES) {
            throw new IllegalArgumentException("private preview byte limit is invalid");
        }
        // ConstrainedS3StoragePort owns this exact original-key format.
        if (privateStorageKey == null || !privateStorageKey.matches(
                "media/originals/[0-9a-f-]{36}/[0-9a-f-]{36}")) {
            throw new IllegalArgumentException("private original key is invalid");
        }
        URI target = URI.create(endpoint.toASCIIString().replaceAll("/$", "")
                + "/" + bucket + "/" + privateStorageKey);
        Map<String, String> headers = signGet(target, clock.instant(), region, accessKey, secretKey,
                sessionToken, Map.of());
        HttpRequest.Builder request = HttpRequest.newBuilder(target).GET().timeout(REQUEST_TIMEOUT);
        headers.forEach((name, value) -> {
            if (!"host".equals(name)) {
                // JDK supplies Host from the exact URI used by the signature.
                request.header(name, value);
            }
        });
        CompletableFuture<HttpResponse<byte[]>> response = client.sendAsync(request.build(),
                info -> new BoundedBodySubscriber(maximumBytes));
        try {
            HttpResponse<byte[]> result = response.get(REQUEST_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            if (result.statusCode() != 200) {
                throw new IOException("private storage read failed");
            }
            return result.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("private storage read failed");
        } catch (ExecutionException | TimeoutException exception) {
            throw new IOException("private storage read failed");
        } finally {
            response.cancel(true);
        }
    }

    // The official AWS GET vector exercises this exact signing path, including Range.
    static Map<String, String> signGet(
            URI target, Instant now, String region, String accessKey, String secretKey,
            String sessionToken, Map<String, String> additionalHeaders
    ) {
        String timestamp = AMZ_DATE.format(now);
        String date = timestamp.substring(0, 8);
        TreeMap<String, String> headers = new TreeMap<>(additionalHeaders);
        headers.put("host", target.getRawAuthority());
        headers.put("x-amz-content-sha256", EMPTY_SHA256);
        headers.put("x-amz-date", timestamp);
        if (!sessionToken.isEmpty()) {
            headers.put("x-amz-security-token", sessionToken);
        }
        StringBuilder canonicalHeaders = new StringBuilder();
        headers.forEach((name, value) -> canonicalHeaders.append(name).append(':').append(value.strip()).append('\n'));
        String signedHeaders = String.join(";", headers.keySet());
        String canonical = "GET\n" + target.getRawPath() + "\n\n" + canonicalHeaders + "\n"
                + signedHeaders + "\n" + EMPTY_SHA256;
        String scope = date + "/" + region + "/s3/aws4_request";
        String toSign = "AWS4-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n" + sha256(canonical);
        byte[] key = hmac(("AWS4" + secretKey).getBytes(StandardCharsets.UTF_8), date);
        key = hmac(key, region);
        key = hmac(key, "s3");
        key = hmac(key, "aws4_request");
        String signature = HexFormat.of().formatHex(hmac(key, toSign));
        headers.put("authorization", "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + scope
                + ",SignedHeaders=" + signedHeaders + ",Signature=" + signature);
        return Map.copyOf(headers);
    }

    private static URI validateEndpoint(URI endpoint, boolean allowLocalHttp) {
        Objects.requireNonNull(endpoint, "endpoint");
        boolean localHttp = allowLocalHttp && "http".equals(endpoint.getScheme())
                && Set.of("localhost", "127.0.0.1", "[::1]").contains(endpoint.getHost());
        if ((!"https".equals(endpoint.getScheme()) && !localHttp) || endpoint.getHost() == null
                || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null
                || !(endpoint.getPath().isEmpty() || "/".equals(endpoint.getPath()))) {
            throw new IllegalArgumentException("private storage endpoint is invalid");
        }
        return endpoint;
    }

    private static String requirePattern(String value, String pattern) {
        if (value == null || !value.matches(pattern)) {
            throw new IllegalArgumentException("private storage configuration is invalid");
        }
        return value;
    }

    private static String boundedSecret(String value, boolean emptyAllowed) {
        if (value == null || (!emptyAllowed && value.isBlank()) || value.length() > 16384
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("private storage configuration is invalid");
        }
        return value;
    }

    private static byte[] hmac(byte[] key, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("required signing primitives are unavailable");
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("required signing primitives are unavailable");
        }
    }

    private static final class BoundedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final int maximumBytes;
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private Flow.Subscription subscription;

        private BoundedBodySubscriber(int maximumBytes) {
            this.maximumBytes = maximumBytes;
        }

        @Override
        public CompletionStage<byte[]> getBody() {
            return result.minimalCompletionStage();
        }

        @Override
        public void onSubscribe(Flow.Subscription value) {
            subscription = value;
            value.request(Long.MAX_VALUE);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            Flow.Subscription current = subscription;
            if (current == null) {
                result.completeExceptionally(new IOException("private storage read failed"));
                return;
            }
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > maximumBytes - bytes.size()) {
                    current.cancel();
                    result.completeExceptionally(new IOException("private storage read failed"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
        }

        @Override
        public void onError(Throwable error) {
            result.completeExceptionally(new IOException("private storage read failed"));
        }

        @Override
        public void onComplete() {
            result.complete(bytes.toByteArray());
        }
    }
}
