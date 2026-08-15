package tw.basketball.magazine.readerlibrary.api;

import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.readerlibrary.application.ReaderLibraryProblemException;
import tw.basketball.magazine.readerlibrary.application.ReaderLibraryService;
import tw.basketball.magazine.readerlibrary.application.ReaderLibraryService.ProgressMergeRequest;
import tw.basketball.magazine.readerlibrary.application.ReaderLibraryService.ProgressUpsert;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/** Authenticated reader bookmark and progress API. */
@RestController
@ConditionalOnBean(ReaderLibraryService.class)
public final class ReaderLibraryController {
    private static final String BASE_PATH = "/api/v1/me";
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    private final ReaderLibraryService service;

    public ReaderLibraryController(ReaderLibraryService service) {
        this.service = service;
    }

    @GetMapping(path = BASE_PATH + "/bookmarks", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> bookmarks(
            @RequestParam(defaultValue = "20") int limit,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return ok(service.bookmarks(reader(authentication), limit), request);
    }

    @PutMapping(path = BASE_PATH + "/bookmarks/{articleId}")
    public ResponseEntity<Void> putBookmark(
            @PathVariable String articleId,
            Authentication authentication,
            HttpServletRequest request
    ) {
        service.putBookmark(reader(authentication), uuid(articleId, "/articleId"));
        return noContent(request);
    }

    @DeleteMapping(path = BASE_PATH + "/bookmarks/{articleId}")
    public ResponseEntity<Void> deleteBookmark(
            @PathVariable String articleId,
            Authentication authentication,
            HttpServletRequest request
    ) {
        service.deleteBookmark(reader(authentication), uuid(articleId, "/articleId"));
        return noContent(request);
    }

    @GetMapping(path = BASE_PATH + "/progress", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> progress(
            @RequestParam(defaultValue = "20") int limit,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return ok(service.progress(reader(authentication), limit), request);
    }

    @PutMapping(
            path = BASE_PATH + "/progress/{articleId}",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> putProgress(
            @PathVariable String articleId,
            @RequestBody ProgressUpsert input,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return ok(
                service.putProgress(
                        reader(authentication),
                        uuid(articleId, "/articleId"),
                        input
                ),
                request
        );
    }

    @PostMapping(
            path = BASE_PATH + "/progress:merge",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> merge(
            @RequestBody ProgressMergeRequest input,
            Authentication authentication,
            HttpServletRequest request
    ) {
        return ok(service.merge(reader(authentication), input), request);
    }

    private static ResponseEntity<?> ok(Object body, HttpServletRequest request) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId(request).value())
                .header("X-Content-Type-Options", "nosniff")
                .body(body);
    }

    private static ResponseEntity<Void> noContent(HttpServletRequest request) {
        return ResponseEntity.noContent()
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId(request).value())
                .header("X-Content-Type-Options", "nosniff")
                .build();
    }

    private static AuthenticatedReader reader(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication.getAuthorities().stream().noneMatch(
                        authority -> ("ROLE_" + RoleCode.READER.name()).equals(
                                authority.getAuthority()
                        )
                )) {
            throw new ReaderLibraryProblemException(
                    ProblemCode.AUTHENTICATION_REQUIRED,
                    List.of()
            );
        }
        return AuthenticatedReader.from(authentication);
    }

    private static UUID uuid(String value, String path) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw ReaderLibraryProblemException.invalid(
                    path,
                    "uuid_invalid",
                    "identifier must be a UUID"
            );
        }
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Invalid caller input is not reflected.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
