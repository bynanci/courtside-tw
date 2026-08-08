package tw.basketball.magazine.identity;

import java.net.URI;
import java.util.Objects;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Provider-neutral OIDC resource-server settings.
 *
 * <p>Production configuration must use an HTTPS issuer. HTTP is available only
 * when explicitly enabled for an isolated local OIDC stub; no provider
 * credential or token is represented by these properties.</p>
 */
@ConfigurationProperties(prefix = "courtside.security.oidc")
public record OidcSecurityProperties(
        String issuer,
        String audience,
        boolean allowInsecureHttp
) {
    public OidcSecurityProperties {
        issuer = validateIssuer(issuer, allowInsecureHttp);
        audience = validateText("audience", audience, 256);
    }

    private static String validateIssuer(String value, boolean allowHttp) {
        String issuerValue = validateText("issuer", value, 2048);
        URI issuerUri;
        try {
            issuerUri = URI.create(issuerValue);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("OIDC issuer must be a valid absolute URI", exception);
        }

        String scheme = issuerUri.getScheme();
        if (issuerUri.getHost() == null
                || (!"https".equalsIgnoreCase(scheme)
                && !"http".equalsIgnoreCase(scheme))
                || issuerUri.getUserInfo() != null
                || issuerUri.getQuery() != null
                || issuerUri.getFragment() != null) {
            throw new IllegalArgumentException("OIDC issuer must be a public absolute HTTP(S) URI");
        }
        if ("http".equalsIgnoreCase(scheme) && !allowHttp) {
            throw new IllegalArgumentException("OIDC issuer must use HTTPS unless local HTTP is explicitly enabled");
        }
        return issuerValue;
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
