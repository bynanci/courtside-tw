package tw.basketball.magazine.search.api;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Arrays;
import java.util.HexFormat;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.search.application.SearchRequestException;
import tw.basketball.magazine.search.application.SearchService;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Anonymous search and public taxonomy endpoints over the publication projection. */
@RestController
public final class PublicSearchController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String SEARCH_INSTANCE = "/api/v1/public/search";
    private static final String TAXONOMY_INSTANCE = "/api/v1/public/taxonomy";
    private static final CacheControl PUBLIC_CACHE_CONTROL = CacheControl.maxAge(Duration.ofSeconds(60))
            .cachePublic()
            .mustRevalidate();

    private final Supplier<SearchService> serviceResolver;
    private volatile SearchService resolvedService;

    @Autowired
    public PublicSearchController(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        ObjectProvider<JdbcTemplate> provider = Objects.requireNonNull(
                jdbcTemplateProvider,
                "jdbcTemplateProvider"
        );
        serviceResolver = () -> resolveJdbcService(provider);
    }

    public PublicSearchController(SearchService service) {
        SearchService fixed = Objects.requireNonNull(service, "service");
        serviceResolver = () -> fixed;
    }

    @GetMapping(path = SEARCH_INSTANCE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> search(
            @RequestParam(name = "q", defaultValue = "") String query,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) List<String> taxonomy,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        try {
            Object page = service().search(query, cursor, limit, type, taxonomy);
            return conditionalResponse(page, etag(page), ifNoneMatch, requestId);
        } catch (SearchRequestException exception) {
            return invalidRequest(SEARCH_INSTANCE, exception, requestId);
        }
    }

    @GetMapping(
            path = "/api/v1/public/taxonomy/{type}",
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> taxonomy(
            @PathVariable String type,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) String limit,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        try {
            Object page = service().listTaxonomy(type, cursor, limit);
            return conditionalResponse(page, etag(page), ifNoneMatch, requestId);
        } catch (SearchRequestException exception) {
            return invalidRequest(TAXONOMY_INSTANCE + "/" + type, exception, requestId);
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
            String instance,
            SearchRequestException exception,
            RequestId requestId
    ) {
        ProblemDetails problem = ProblemDetailsMapper.invalidRequest(
                instance,
                requestId,
                List.of(new FieldError(exception.path(), exception.code(), exception.getMessage()))
        );
        return ResponseEntity.status(problem.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .body(problem);
    }

    private static String etag(Object page) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(page.toString().getBytes(StandardCharsets.UTF_8));
            return "\"" + HexFormat.of().formatHex(digest) + "\"";
        } catch (Exception exception) {
            throw new IllegalStateException("unable to checksum search projection", exception);
        }
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

    private SearchService service() {
        SearchService service = serviceResolver.get();
        if (service == null) {
            throw new IllegalStateException("search persistence is unavailable");
        }
        return service;
    }

    private SearchService resolveJdbcService(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        SearchService current = resolvedService;
        if (current != null) {
            return current;
        }
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate == null) {
            return null;
        }
        SearchService created = new SearchService(jdbcTemplate);
        resolvedService = created;
        return created;
    }
}
