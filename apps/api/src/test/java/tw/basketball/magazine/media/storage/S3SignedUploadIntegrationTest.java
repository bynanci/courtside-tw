package tw.basketball.magazine.media.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

final class S3SignedUploadIntegrationTest {
    private static final UUID ASSET_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000019");
    private static final UUID UPLOAD_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000119");
    private static final Instant NOW = Instant.parse("2026-08-08T00:00:00Z");
    private static final long MAX_BYTES = 20L * 1024L * 1024L;

    @Test
    void bindsServerGeneratedPrivateKeySizeMimeAndExpiryToSigner() {
        RecordingSigner signer = new RecordingSigner();
        ConstrainedS3StoragePort port = port(signer);

        SignedUpload upload = port.createSignedUpload(
                new MediaUploadRequest(ASSET_ID, "image/jpeg", 2048)
        );

        assertEquals(
                "media/originals/00000000-0000-4000-8000-000000000019/"
                        + "00000000-0000-4000-8000-000000000119",
                upload.storageKey()
        );
        assertEquals(upload.storageKey(), signer.storageKey);
        assertEquals("image/jpeg", signer.mimeType);
        assertEquals(2048, signer.maxBytes);
        assertEquals(NOW.plus(Duration.ofMinutes(5)), upload.expiresAt());
        assertEquals(upload.expiresAt(), signer.expiresAt);
        assertEquals(StorageVisibility.PRIVATE_ORIGINAL, upload.visibility());
        assertEquals(URI.create("https://signed.example.test/upload"), upload.url());
        assertTrue(upload.url().getScheme().equals("https"));
    }

    @Test
    void rejectsOversizedAndNonImageRequestsBeforeSignerCall() {
        RecordingSigner signer = new RecordingSigner();
        ConstrainedS3StoragePort port = port(signer);

        assertThrows(
                IllegalArgumentException.class,
                () -> port.createSignedUpload(
                        new MediaUploadRequest(ASSET_ID, "image/png", MAX_BYTES + 1)
                )
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> port.createSignedUpload(
                        new MediaUploadRequest(ASSET_ID, "application/javascript", 100)
                )
        );
        assertFalse(signer.called);
    }

    @Test
    void rejectsInvalidPolicyBeforeAnyUploadCanBeIssued() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new StorageUploadPolicy(
                        Duration.ofMinutes(6),
                        MAX_BYTES,
                        Set.of("image/jpeg")
                )
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> new StorageUploadPolicy(
                        Duration.ZERO,
                        MAX_BYTES,
                        Set.of("image/jpeg")
                )
        );
    }

    private static ConstrainedS3StoragePort port(RecordingSigner signer) {
        return new ConstrainedS3StoragePort(
                signer,
                Clock.fixed(NOW, ZoneOffset.UTC),
                new StorageUploadPolicy(
                        Duration.ofMinutes(5),
                        MAX_BYTES,
                        Set.of("image/avif", "image/jpeg", "image/png", "image/webp")
                ),
                () -> UPLOAD_ID
        );
    }

    private static final class RecordingSigner implements SignedUploadSigner {
        private boolean called;
        private String storageKey;
        private String mimeType;
        private long maxBytes;
        private Instant expiresAt;

        @Override
        public URI signPut(
                String storageKey,
                String mimeType,
                long maxBytes,
                Instant expiresAt,
                StorageVisibility visibility
        ) {
            called = true;
            this.storageKey = storageKey;
            this.mimeType = mimeType;
            this.maxBytes = maxBytes;
            this.expiresAt = expiresAt;
            assertEquals(StorageVisibility.PRIVATE_ORIGINAL, visibility);
            return URI.create("https://signed.example.test/upload");
        }
    }
}
