package tw.basketball.magazine.shared;

import java.util.List;
import java.util.UUID;

import org.springframework.core.Ordered;
import org.springframework.core.MethodParameter;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Maps MVC request parsing and negotiation failures before application code runs. */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE)
public final class ApiExceptionHandler extends ResponseEntityExceptionHandler implements ResponseBodyAdvice<Object> {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType contentType,
            Class<? extends HttpMessageConverter<?>> converterType,
            ServerHttpRequest request,
            ServerHttpResponse response
    ) {
        if (body == null || !MediaType.APPLICATION_PROBLEM_JSON.isCompatibleWith(contentType)) {
            return body;
        }
        var tree = body instanceof String value ? JSON.readTree(value) : JSON.valueToTree(body);
        if (!(tree instanceof ObjectNode problem) || !problem.has("code") || !problem.has("requestId")) {
            return body;
        }
        // Operation replay may carry the first request's correlation ID and workflow-relative URI.
        // Correct only this HTTP envelope; persisted receipts and successful bodies stay byte-for-byte intact.
        RequestId requestId = safeRequestId(response.getHeaders().getFirst(REQUEST_ID_HEADER));
        problem.put("instance", request.getURI().getRawPath());
        problem.put("requestId", requestId.value());
        response.getHeaders().set(REQUEST_ID_HEADER, requestId.value());
        return body instanceof String ? JSON.writeValueAsString(problem) : problem;
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception exception,
            Object body,
            HttpHeaders headers,
            HttpStatusCode statusCode,
            WebRequest request
    ) {
        if (!statusCode.is4xxClientError() || !(request instanceof ServletWebRequest servletRequest)) {
            return super.handleExceptionInternal(exception, body, headers, statusCode, request);
        }
        // Invalid payloads, media types, methods and binding values share the documented 400 contract.
        ProblemCode code = switch (statusCode.value()) {
            case 401 -> ProblemCode.AUTHENTICATION_REQUIRED;
            case 403 -> ProblemCode.FORBIDDEN;
            case 404 -> ProblemCode.RESOURCE_NOT_FOUND;
            case 409 -> ProblemCode.VERSION_CONFLICT;
            case 422 -> ProblemCode.RIGHTS_OR_CONTENT_GATE;
            case 429 -> ProblemCode.RATE_LIMITED;
            default -> ProblemCode.INVALID_REQUEST;
        };
        RequestId requestId = requestId(servletRequest);
        ProblemDetails problem = ProblemDetailsMapper.from(
                code, servletRequest.getRequest().getRequestURI(), requestId, List.of()
        );
        // Exception messages can include submitted JSON, parser internals or credential values.
        return ResponseEntity.status(code.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .header("X-Content-Type-Options", "nosniff")
                .body(problem);
    }

    private static RequestId requestId(ServletWebRequest request) {
        return safeRequestId(request.getRequest().getHeader(REQUEST_ID_HEADER));
    }

    private static RequestId safeRequestId(String candidate) {
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Untrusted correlation input must never be reflected.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
