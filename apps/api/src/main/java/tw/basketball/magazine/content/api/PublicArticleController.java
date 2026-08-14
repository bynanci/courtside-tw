package tw.basketball.magazine.content.api;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
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

import tw.basketball.magazine.content.application.PublicArticleRequestException;
import tw.basketball.magazine.content.application.PublicArticleService;
import tw.basketball.magazine.content.domain.PublicArticleModels.ArticleProjection;
import tw.basketball.magazine.content.persistence.JdbcPublicArticleRepository;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Anonymous, cacheable published Article projection endpoint. */
@RestController
@RequestMapping("/api/v1/public/articles")
public final class PublicArticleController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String COLLECTION_INSTANCE = "/api/v1/public/articles";
    private static final String PUBLIC_CACHE_CONTROL = "no-cache, max-age=0, must-revalidate";

    private final Supplier<PublicArticleService> serviceResolver;
    private volatile PublicArticleService resolvedService;

    /** Lazily resolves JDBC while remaining directly constructible in integration tests. */
    @Autowired
    public PublicArticleController(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        ObjectProvider<JdbcTemplate> provider = Objects.requireNonNull(
                jdbcTemplateProvider,
                "jdbcTemplateProvider"
        );
        serviceResolver = () -> resolveJdbcService(provider);
    }

    public PublicArticleController(PublicArticleService service) {
        PublicArticleService fixed = Objects.requireNonNull(service, "service");
        serviceResolver = () -> fixed;
    }

    @GetMapping(path = "/{articleSlug}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> findBySlug(
            @PathVariable String articleSlug,
            @RequestParam(name = "revision", required = false) String requestedRevision,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        PublicArticleService service = service();
        if (service == null) {
            return notFound(requestId);
        }
        try {
            Optional<ArticleProjection> article = service.findBySlug(articleSlug, requestedRevision);
            return article
                    .<ResponseEntity<?>>map(value -> conditionalResponse(
                            value,
                            PublicArticleEtag.forProjection(value),
                            ifNoneMatch,
                            requestId
                    ))
                    .orElseGet(() -> notFound(requestId));
        } catch (PublicArticleRequestException exception) {
            return invalidRequest(exception, requestId);
        }
    }

    private static ResponseEntity<?> conditionalResponse(
            ArticleProjection article,
            String etag,
            String ifNoneMatch,
            RequestId requestId
    ) {
        if (etagMatches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag)
                    .header(HttpHeaders.CACHE_CONTROL, PUBLIC_CACHE_CONTROL)
                    .header(REQUEST_ID_HEADER, requestId.value())
                    .build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .eTag(etag)
                .header(HttpHeaders.CACHE_CONTROL, PUBLIC_CACHE_CONTROL)
                .header(REQUEST_ID_HEADER, requestId.value())
                .body(article);
    }

    private static ResponseEntity<ProblemDetails> invalidRequest(
            PublicArticleRequestException exception,
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

    private PublicArticleService service() {
        return serviceResolver.get();
    }

    private PublicArticleService resolveJdbcService(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        PublicArticleService current = resolvedService;
        if (current != null) {
            return current;
        }
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate == null) {
            return null;
        }
        PublicArticleService created = new PublicArticleService(new JdbcPublicArticleRepository(jdbcTemplate));
        resolvedService = created;
        return created;
    }
}
