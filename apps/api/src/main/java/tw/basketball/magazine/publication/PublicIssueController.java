package tw.basketball.magazine.publication;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.publication.PublicIssueModels.Page;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Anonymous, cacheable Issue metadata and ordered TOC endpoint. */
@RestController
@RequestMapping("/api/v1/public/issues")
public final class PublicIssueController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String COLLECTION_INSTANCE = "/api/v1/public/issues";
    private static final CacheControl PUBLIC_CACHE_CONTROL = CacheControl.maxAge(Duration.ofSeconds(60))
            .cachePublic()
            .mustRevalidate();

    private final Supplier<PublicIssueService> serviceResolver;
    private volatile PublicIssueService resolvedService;

    /**
     * Resolves the JDBC projection lazily because application component scanning
     * runs before JDBC auto-configuration registers its bean definitions.
     */
    @Autowired
    public PublicIssueController(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        ObjectProvider<JdbcTemplate> provider = Objects.requireNonNull(
                jdbcTemplateProvider,
                "jdbcTemplateProvider"
        );
        serviceResolver = () -> resolveJdbcService(provider);
    }

    PublicIssueController(PublicIssueService service) {
        PublicIssueService fixed = Objects.requireNonNull(service, "service");
        serviceResolver = () -> fixed;
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> list(
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String limit,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        PublicIssueService service = service();
        if (service == null) {
            return notFound(requestId);
        }
        try {
            Page page = service.list(cursor, limit);
            return conditionalResponse(page, PublicIssueEtag.forPage(page), ifNoneMatch, requestId);
        } catch (PublicIssueRequestException exception) {
            return invalidRequest(exception, requestId);
        }
    }

    @GetMapping(path = "/{issueSlug}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> findBySlug(
            @PathVariable String issueSlug,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        PublicIssueService service = service();
        if (service == null) {
            return notFound(requestId);
        }
        try {
            return service.findBySlug(issueSlug)
                    .<ResponseEntity<?>>map(issue -> conditionalResponse(
                            issue,
                            PublicIssueEtag.forDetail(issue),
                            ifNoneMatch,
                            requestId
                    ))
                    .orElseGet(() -> notFound(requestId));
        } catch (PublicIssueRequestException exception) {
            return invalidRequest(exception, requestId);
        }
    }

    private static ResponseEntity<?> conditionalResponse(
            Object body,
            String etag,
            String ifNoneMatch,
            RequestId requestId
    ) {
        if (etagMatches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag)
                    .cacheControl(PUBLIC_CACHE_CONTROL)
                    .header(REQUEST_ID_HEADER, requestId.value())
                    .build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .eTag(etag)
                .cacheControl(PUBLIC_CACHE_CONTROL)
                .header(REQUEST_ID_HEADER, requestId.value())
                .body(body);
    }

    private static ResponseEntity<ProblemDetails> invalidRequest(
            PublicIssueRequestException exception,
            RequestId requestId
    ) {
        ProblemDetails problem = ProblemDetailsMapper.invalidRequest(
                COLLECTION_INSTANCE,
                requestId,
                List.of(new FieldError(exception.path(), exception.code(), exception.getMessage()))
        );
        return problemResponse(problem, requestId);
    }

    private static ResponseEntity<ProblemDetails> notFound(RequestId requestId) {
        ProblemDetails problem = ProblemDetailsMapper.from(
                ProblemCode.RESOURCE_NOT_FOUND,
                COLLECTION_INSTANCE,
                requestId,
                List.of()
        );
        return problemResponse(problem, requestId);
    }

    private static ResponseEntity<ProblemDetails> problemResponse(
            ProblemDetails problem,
            RequestId requestId
    ) {
        return ResponseEntity.status(problem.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .body(problem);
    }

    private static boolean etagMatches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
            return false;
        }
        return Arrays.stream(ifNoneMatch.split(","))
                .map(String::trim)
                .map(candidate -> candidate.startsWith("W/") ? candidate.substring(2) : candidate)
                .anyMatch(candidate -> candidate.equals("*") || candidate.equals(etag));
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null && !candidate.isBlank()) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Never reflect malformed caller input into a response or log context.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }

    private PublicIssueService service() {
        return serviceResolver.get();
    }

    private PublicIssueService resolveJdbcService(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        PublicIssueService current = resolvedService;
        if (current != null) {
            return current;
        }
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate == null) {
            return null;
        }
        PublicIssueService created = new PublicIssueService(new JdbcPublicIssueRepository(jdbcTemplate));
        resolvedService = created;
        return created;
    }
}
