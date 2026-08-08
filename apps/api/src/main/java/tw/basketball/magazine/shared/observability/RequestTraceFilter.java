package tw.basketball.magazine.shared.observability;

import java.io.IOException;
import java.time.Duration;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

/** Propagates bounded request/trace IDs without logging authentication material. */
public final class RequestTraceFilter extends OncePerRequestFilter {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String TRACE_ID_HEADER = "X-Trace-Id";
    private static final String REQUEST_ID_MDC = "request_id";
    private static final String TRACE_ID_MDC = "trace_id";

    private final CourtsideObservabilityMetrics metrics;

    public RequestTraceFilter(CourtsideObservabilityMetrics metrics) {
        this.metrics = metrics;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = safeRequestId(request.getHeader(REQUEST_ID_HEADER));
        String traceId = safeRequestId(request.getHeader(TRACE_ID_HEADER));
        long startedAt = System.nanoTime();
        MDC.put(REQUEST_ID_MDC, requestId);
        MDC.put(TRACE_ID_MDC, traceId);
        response.setHeader(REQUEST_ID_HEADER, requestId);
        response.setHeader(TRACE_ID_HEADER, traceId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            Object route = request.getAttribute("org.springframework.web.servlet.HandlerMapping.bestMatchingPattern");
            String routeTemplate = route instanceof String value ? value : null;
            metrics.recordHttpRequest(
                    routeTemplate,
                    request.getMethod(),
                    response.getStatus(),
                    Duration.ofNanos(System.nanoTime() - startedAt)
            );
            MDC.remove(REQUEST_ID_MDC);
            MDC.remove(TRACE_ID_MDC);
        }
    }

    private static String safeRequestId(String value) {
        if (value != null) {
            try {
                return tw.basketball.magazine.shared.RequestId.of(value).value();
            } catch (IllegalArgumentException ignored) {
                // Generate a fresh correlation ID for untrusted input.
            }
        }
        return UUID.randomUUID().toString();
    }
}
