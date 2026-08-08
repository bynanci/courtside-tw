package tw.basketball.magazine.identity;

import java.net.URI;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Provider-neutral OIDC resource-server settings.
 *
 * <p>Production configuration must use HTTPS issuer/JWKS endpoints. HTTP is
 * available only when explicitly enabled for an isolated local OIDC stub; no
 * provider credential or token is represented by these properties.</p>
 */
@ConfigurationProperties(prefix = "courtside.security.oidc")
public record OidcSecurityProperties(
        String issuer,
        String audience,
        String jwkSetUri,
        boolean allowInsecureHttp
) {
    public OidcSecurityProperties(String issuer, String audience, boolean allowInsecureHttp) {
        this(issuer, audience, null, allowInsecureHttp);
    }

    public OidcSecurityProperties {
        issuer = validateOptionalText("issuer", issuer, 2048);
        audience = validateOptionalText("audience", audience, 256);
        jwkSetUri = jwkSetUri == null
                ? null
                : validateHttpUri("jwkSetUri", jwkSetUri, allowInsecureHttp, false);
    }

    public String requireIssuer() {
        return requireConfigured("issuer", issuer);
    }

    public String requireAudience() {
        return requireConfigured("audience", audience);
    }

    public String requireJwkSetUri() {
        return requireConfigured("jwkSetUri", jwkSetUri);
    }

    private static String requireConfigured(String name, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required when OIDC is configured");
        }
        return value;
    }

    private static String validateHttpUri(
            String name,
            String value,
            boolean allowHttp,
            boolean rejectQuery
    ) {
        String text = validateText(name, value, 2048);
        URI uri;
        try {
            uri = URI.create(text);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException(name + " must be a valid absolute URI", exception);
        }

        String scheme = uri.getScheme();
        if (uri.getHost() == null
                || (!"https".equalsIgnoreCase(scheme)
                && !"http".equalsIgnoreCase(scheme))
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || (rejectQuery && uri.getQuery() != null)) {
            throw new IllegalArgumentException(name + " must be a public absolute HTTP(S) URI");
        }
        if ("http".equalsIgnoreCase(scheme) && !allowHttp) {
            throw new IllegalArgumentException(
                    name + " must use HTTPS unless local HTTP is explicitly enabled"
            );
        }
        return text;
    }

    private static String validateOptionalText(String name, String value, int maxLength) {
        return value == null ? null : validateText(name, value, maxLength);
    }

    private static String validateText(String name, String value, int maxLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maxLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }
}
