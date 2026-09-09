package tw.basketball.magazine.publication.worker;

import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Opt-in provider-neutral purge settings; an absent endpoint remains unconfigured. */
@ConfigurationProperties(prefix = "courtside.publication.invalidation")
public record PublicationInvalidationProperties(
        URI endpoint,
        String bearerToken,
        Duration timeout
) {
    public PublicationInvalidationProperties {
        timeout = timeout == null ? Duration.ofSeconds(3) : timeout;
        if (timeout.compareTo(Duration.ofMillis(100)) < 0
                || timeout.compareTo(Duration.ofSeconds(5)) > 0) {
            throw new IllegalArgumentException("invalidation timeout must be between 100ms and 5s");
        }
        if (endpoint == null && bearerToken != null) {
            throw new IllegalArgumentException("invalidation bearer token requires an endpoint");
        }
        if (endpoint != null) {
            validateEndpoint(endpoint);
            if (bearerToken == null || bearerToken.length() > 4096
                    || !bearerToken.matches("[A-Za-z0-9._~+/\\-]+=*")) {
                throw new IllegalArgumentException("invalidation bearer token must be configured and valid");
            }
        }
    }

    public boolean configured() {
        return endpoint != null;
    }

    @Override
    public String toString() {
        return "PublicationInvalidationProperties[configured=" + configured()
                + ", bearerToken=[REDACTED], timeout=" + timeout + "]";
    }

    private static void validateEndpoint(URI endpoint) {
        String host = endpoint.getHost();
        boolean loopback = "127.0.0.1".equals(host) || "[::1]".equals(host);
        boolean safeScheme = "https".equalsIgnoreCase(endpoint.getScheme())
                || ("http".equalsIgnoreCase(endpoint.getScheme()) && loopback);
        if (!safeScheme || host == null || endpoint.getRawUserInfo() != null
                || endpoint.getRawFragment() != null || endpoint.getRawQuery() != null
                || endpoint.getPort() == 0 || endpoint.getPort() > 65535
                || endpoint.toASCIIString().length() > 2048) {
            throw new IllegalArgumentException(
                    "invalidation endpoint must use HTTPS or explicit loopback HTTP without credentials, query or fragment"
            );
        }
    }
}
