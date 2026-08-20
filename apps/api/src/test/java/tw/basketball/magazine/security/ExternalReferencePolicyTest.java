package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

final class ExternalReferencePolicyTest {
    @Test
    void allowsOnlyPublicHttpsReferencesWithoutCredentialsOrFragments() {
        assertDoesNotThrow(() -> ExternalReferencePolicy.requireSafe("https://cdn.example.test/embed/1"));
        assertDoesNotThrow(() -> ExternalReferencePolicy.requireSafe("https://provider.example.test/jwks?tenant=courtside"));
    }

    @Test
    void rejectsSchemesCredentialsFragmentsAndUnboundedReferences() {
        assertThrows(IllegalArgumentException.class,
                () -> ExternalReferencePolicy.requireSafe("http://cdn.example.test/embed/1"));
        assertThrows(IllegalArgumentException.class,
                () -> ExternalReferencePolicy.requireSafe("https://user:pass@cdn.example.test/embed/1"));
        assertThrows(IllegalArgumentException.class,
                () -> ExternalReferencePolicy.requireSafe("https://cdn.example.test/embed/1#fragment"));
        assertThrows(IllegalArgumentException.class,
                () -> ExternalReferencePolicy.requireSafe("https://cdn.example.test/" + "a".repeat(2049)));
    }

    @Test
    void rejectsLoopbackPrivateLinkLocalAndMetadataDestinations() {
        for (String reference : new String[] {
                "https://localhost/embed",
                "https://127.0.0.1/embed",
                "https://10.0.0.4/embed",
                "https://192.168.1.5/embed",
                "https://169.254.169.254/latest/meta-data",
                "https://[::1]/embed",
                "https://metadata.google.internal/computeMetadata/v1"
        }) {
            assertThrows(IllegalArgumentException.class,
                    () -> ExternalReferencePolicy.requireSafe(reference), reference);
        }
    }
}
