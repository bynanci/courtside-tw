package tw.basketball.magazine.security;

/** Shared, provider-neutral limits and header values for the HTTP boundary. */
public final class SecurityBoundaryPolicy {
    public static final long MAX_REQUEST_BODY_BYTES = 1L * 1024L * 1024L;
    public static final String CONTENT_SECURITY_POLICY =
            "default-src 'self'; base-uri 'none'; object-src 'none'; "
                    + "frame-ancestors 'none'; script-src 'self'; style-src 'self'; "
                    + "img-src 'self' https: data:; font-src 'self'; connect-src 'self'; "
                    + "form-action 'self'";
    public static final String PERMISSIONS_POLICY =
            "camera=(), microphone=(), geolocation=(), payment=()";

    private SecurityBoundaryPolicy() {
    }
}
