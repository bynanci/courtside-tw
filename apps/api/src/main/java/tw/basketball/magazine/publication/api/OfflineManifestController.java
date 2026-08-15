package tw.basketball.magazine.publication.api;

import java.time.Duration;
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
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.publication.application.OfflineManifestService;
import tw.basketball.magazine.publication.application.OfflineManifestService.OfflineManifest;
import tw.basketball.magazine.publication.application.OfflineManifestService.WithdrawalManifest;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Anonymous versioned issue and withdrawal manifests for bounded offline clients. */
@RestController
@RequestMapping("/api/v1/public")
public final class OfflineManifestController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String MANIFEST_INSTANCE = "/api/v1/public/offline";
    private static final CacheControl MANIFEST_CACHE_CONTROL = CacheControl.maxAge(Duration.ofSeconds(30))
            .cachePublic()
            .mustRevalidate();

    private final Supplier<OfflineManifestService> serviceResolver;
    private volatile OfflineManifestService resolvedService;

    /** Resolves JDBC lazily so standalone API tests can inject the service directly. */
    @Autowired
    public OfflineManifestController(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        ObjectProvider<JdbcTemplate> provider = Objects.requireNonNull(
                jdbcTemplateProvider,
                "jdbcTemplateProvider"
        );
        serviceResolver = () -> resolveJdbcService(provider);
    }

    public OfflineManifestController(OfflineManifestService service) {
        OfflineManifestService fixed = Objects.requireNonNull(service, "service");
        serviceResolver = () -> fixed;
    }

    @GetMapping(
            path = "/offline/issues/{issueSlug}/manifest",
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> issueManifest(
            @PathVariable String issueSlug,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        OfflineManifestService service = service();
        if (service == null) {
            return notFound(requestId);
        }
        return service.findIssueManifest(issueSlug)
                .<ResponseEntity<?>>map(manifest -> conditionalResponse(
                        manifest,
                        manifest.checksum(),
                        ifNoneMatch,
                        requestId
                ))
                .orElseGet(() -> notFound(requestId));
    }

    @GetMapping(path = "/withdrawals", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<WithdrawalManifest> withdrawalManifest(HttpServletRequest request) {
        RequestId requestId = requestId(request);
        OfflineManifestService service = service();
        if (service == null) {
            return ResponseEntity.<WithdrawalManifest>status(HttpStatus.NOT_FOUND)
                    .header(REQUEST_ID_HEADER, requestId.value())
                    .build();
        }
        WithdrawalManifest manifest = service.withdrawalManifest();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(MANIFEST_CACHE_CONTROL)
                .header(REQUEST_ID_HEADER, requestId.value())
                .body(manifest);
    }

    private static ResponseEntity<?> conditionalResponse(
            OfflineManifest manifest,
            String etag,
            String ifNoneMatch,
            RequestId requestId
    ) {
        if (etagMatches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag)
                    .cacheControl(MANIFEST_CACHE_CONTROL)
                    .header(REQUEST_ID_HEADER, requestId.value())
                    .build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .eTag(etag)
                .cacheControl(MANIFEST_CACHE_CONTROL)
                .header(REQUEST_ID_HEADER, requestId.value())
                .body(manifest);
    }

    private static ResponseEntity<ProblemDetails> notFound(RequestId requestId) {
        ProblemDetails problem = ProblemDetailsMapper.from(
                ProblemCode.RESOURCE_NOT_FOUND,
                MANIFEST_INSTANCE,
                requestId,
                List.of()
        );
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
        return java.util.Arrays.stream(ifNoneMatch.split(","))
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

    private OfflineManifestService service() {
        return serviceResolver.get();
    }

    private OfflineManifestService resolveJdbcService(ObjectProvider<JdbcTemplate> jdbcTemplateProvider) {
        OfflineManifestService current = resolvedService;
        if (current != null) {
            return current;
        }
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        if (jdbcTemplate == null) {
            return null;
        }
        OfflineManifestService created = new OfflineManifestService(jdbcTemplate);
        resolvedService = created;
        return created;
    }
}
