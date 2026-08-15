package tw.basketball.magazine.identity.application;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

/** Minimal OIDC identity projection; tokens and credentials never cross this boundary. */
public record AuthenticatedReader(String issuer, String subject, Instant authenticatedAt) {
    private static final String LOCAL_ISSUER = "urn:courtside:local-authentication";

    public AuthenticatedReader {
        issuer = bounded(issuer, "issuer", 2048);
        subject = bounded(subject, "subject", 512);
    }

    public static AuthenticatedReader from(Authentication authentication) {
        Objects.requireNonNull(authentication, "authentication");
        if (!authentication.isAuthenticated()) {
            throw new IllegalArgumentException("authenticated reader is required");
        }
        if (authentication.getPrincipal() instanceof Jwt jwt) {
            String issuer = jwt.getClaimAsString("iss");
            String subject = jwt.getSubject();
            if (issuer == null || subject == null) {
                throw new IllegalArgumentException("OIDC issuer and subject are required");
            }
            return new AuthenticatedReader(issuer, subject, authenticationTime(jwt));
        }
        return new AuthenticatedReader(LOCAL_ISSUER, authentication.getName(), null);
    }

    public boolean wasRecentlyAuthenticated(Instant now, Duration maximumAge) {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(maximumAge, "maximumAge");
        return authenticatedAt != null
                && !authenticatedAt.isAfter(now.plusSeconds(30))
                && !authenticatedAt.isBefore(now.minus(maximumAge));
    }

    private static Instant authenticationTime(Jwt jwt) {
        Object value = jwt.getClaim("auth_time");
        if (value instanceof Number number) {
            return Instant.ofEpochSecond(number.longValue());
        }
        if (value instanceof String text) {
            try {
                return Instant.ofEpochSecond(Long.parseLong(text));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static String bounded(String value, String name, int maximumLength) {
        Objects.requireNonNull(value, name);
        String normalized = value.strip();
        if (normalized.isEmpty()
                || normalized.length() > maximumLength
                || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " must be a bounded OIDC value");
        }
        return normalized;
    }
}
