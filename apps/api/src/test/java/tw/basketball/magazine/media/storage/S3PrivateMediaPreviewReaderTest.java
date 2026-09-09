package tw.basketball.magazine.media.storage;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

final class S3PrivateMediaPreviewReaderTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2013-05-24T00:00:00Z"), ZoneOffset.UTC);
    private static final String ACCESS = "AKIAIOSFODNN7EXAMPLE";
    private static final String SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    private static final String KEY = "media/originals/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002";

    @Test
    void matchesAwsPublishedGetObjectSignatureVector() {
        // Official public example credentials/vector, never deployment credentials.
        // https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html
        Map<String, String> headers = S3PrivateMediaPreviewReader.signGet(
                URI.create("https://examplebucket.s3.amazonaws.com/test.txt"), CLOCK.instant(),
                "us-east-1", ACCESS, SECRET, "", Map.of("range", "bytes=0-9"));
        assertEquals("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,"
                        + "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,"
                        + "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
                headers.get("authorization"));
    }

    @Test
    void realHttpReadSignsServerOnlyHeadersAndBoundsResponse() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/courtside-local/", exchange -> {
            calls.incrementAndGet();
            assertEquals("GET", exchange.getRequestMethod());
            assertEquals("/courtside-local/" + KEY, exchange.getRequestURI().getRawPath());
            assertTrue(exchange.getRequestHeaders().getFirst("Authorization").contains("AWS4-HMAC-SHA256"));
            assertEquals("temporary-session-fixture", exchange.getRequestHeaders().getFirst("x-amz-security-token"));
            byte[] bytes = "image-fixture".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            try (var body = exchange.getResponseBody()) {
                body.write(bytes);
            }
        });
        server.start();
        try {
            S3PrivateMediaPreviewReader reader = reader(server, "temporary-session-fixture");
            assertArrayEquals("image-fixture".getBytes(StandardCharsets.UTF_8), reader.read(KEY, 100));
            assertThrows(IOException.class, () -> reader.read(KEY, 2));
            assertEquals(2, calls.get());
            assertThrows(IllegalArgumentException.class, () -> reader.read("../another-bucket/private", 100));
            assertEquals(2, calls.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void redirectsNeverForwardCredentials() throws Exception {
        AtomicInteger redirectCalls = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/courtside-local/", exchange -> {
            exchange.getResponseHeaders().set("Location", "/stolen");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/stolen", exchange -> {
            redirectCalls.incrementAndGet();
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            IOException failure = assertThrows(IOException.class, () -> reader(server, "").read(KEY, 100));
            assertEquals("private storage read failed", failure.getMessage());
            assertEquals(0, redirectCalls.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void chunkedProviderResponseCannotExceedTheVerifiedOriginalSize() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/courtside-local/", exchange -> {
            exchange.sendResponseHeaders(200, 0);
            try (var body = exchange.getResponseBody()) {
                body.write("oversized-chunked-original".getBytes(StandardCharsets.UTF_8));
            }
        });
        server.start();
        try {
            IOException failure = assertThrows(IOException.class, () -> reader(server, "").read(KEY, 4));
            assertEquals("private storage read failed", failure.getMessage());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void providerErrorsNeverReturnPrivateErrorBodiesOrExceptionCauses() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/courtside-local/", exchange -> {
            byte[] error = "private-key-and-provider-canary".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(403, error.length);
            try (var body = exchange.getResponseBody()) {
                body.write(error);
            }
        });
        server.start();
        try {
            IOException failure = assertThrows(IOException.class, () -> reader(server, "").read(KEY, 100));
            assertEquals("private storage read failed", failure.getMessage());
            assertNull(failure.getCause());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void unsafeEndpointsAndMissingCredentialsFailBeforeAnyNetworkRequest() {
        for (String endpoint : new String[] {"http://example.com", "https://user:pass@example.com", "https://example.com/bucket", "https://example.com?key=secret"}) {
            assertThrows(IllegalArgumentException.class, () -> new S3PrivateMediaPreviewReader(
                    URI.create(endpoint), "courtside-local", "us-east-1", ACCESS, SECRET, "", true, CLOCK));
        }
        assertThrows(IllegalArgumentException.class, () -> new S3PrivateMediaPreviewReader(
                URI.create("https://storage.example.com"), "courtside-local", "us-east-1", "", SECRET, "", false, CLOCK));
    }

    private static S3PrivateMediaPreviewReader reader(HttpServer server, String sessionToken) {
        return new S3PrivateMediaPreviewReader(URI.create("http://127.0.0.1:" + server.getAddress().getPort()),
                "courtside-local", "us-east-1", ACCESS, SECRET, sessionToken, true, CLOCK);
    }
}
