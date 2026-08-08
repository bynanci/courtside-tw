package tw.basketball.magazine.testsupport;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Fixed OIDC claims for tests; it never contains a real token or credential. */
public record OidcStubFixture(
        String issuer,
        String audience,
        String subject,
        Set<String> roles,
        Instant issuedAt,
        Instant expiresAt
) {
    public OidcStubFixture {
        issuer = requireText(issuer, "issuer");
        audience = requireText(audience, "audience");
        subject = requireText(subject, "subject");
        roles = Set.copyOf(Objects.requireNonNull(roles, "roles"));
        issuedAt = Objects.requireNonNull(issuedAt, "issuedAt");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
        if (!expiresAt.isAfter(issuedAt)) {
            throw new IllegalArgumentException("expiresAt must be after issuedAt");
        }
    }

    @Override
    public Set<String> roles() {
        return Set.copyOf(roles);
    }

    public static OidcStubFixture reader() {
        return new OidcStubFixture(
                "https://oidc.example.test/default",
                "courtside-api",
                "fixture-reader-001",
                Set.of("READER"),
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-01T00:05:00Z")
        );
    }

    public Map<String, Object> claims() {
        return Map.of(
                "iss", issuer,
                "aud", List.of(audience),
                "sub", subject,
                "roles", List.copyOf(roles),
                "iat", issuedAt,
                "exp", expiresAt
        );
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.length() > 256) {
            throw new IllegalArgumentException(field + " must be a bounded value");
        }
        return normalized;
    }
}
