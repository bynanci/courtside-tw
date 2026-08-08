package tw.basketball.magazine.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

/** Rejects declared request bodies above the bounded JSON/API envelope. */
public final class RequestPayloadLimitFilter extends OncePerRequestFilter {
    private static final int PAYLOAD_TOO_LARGE = 413;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        long contentLength = request.getContentLengthLong();
        if (contentLength > SecurityBoundaryPolicy.MAX_REQUEST_BODY_BYTES) {
            response.setStatus(PAYLOAD_TOO_LARGE);
            response.setHeader("X-Content-Type-Options", "nosniff");
            return;
        }
        filterChain.doFilter(request, response);
    }
}
