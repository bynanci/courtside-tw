package tw.basketball.magazine.basketball.api;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.application.CanonicalBasketballIntake;
import tw.basketball.magazine.basketball.application.ReviewedEvidenceIntake;
import tw.basketball.magazine.basketball.application.BasketballIntakeJson;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Private, attributable human intake. No URL is fetched and no provider/model output is automatically accepted. */
@RestController
public final class EditorialBasketballIntakeController {
    private static final Set<String> ROLES = Set.of("ROLE_PUBLISHER", "ROLE_ADMIN");
    private final Supplier<ReviewedEvidenceIntake> evidence;
    private final Supplier<CanonicalBasketballIntake> catalog;
    private final ObjectMapper json;

    public EditorialBasketballIntakeController(ReviewedEvidenceIntake evidence, CanonicalBasketballIntake catalog, ObjectMapper json) {
        this(() -> evidence, () -> catalog, json);
    }

    @Autowired
    public EditorialBasketballIntakeController(ObjectProvider<ReviewedEvidenceIntake> evidence,
                                              ObjectProvider<CanonicalBasketballIntake> catalog, ObjectMapper json) {
        this(evidence::getObject, catalog::getObject, json);
    }

    private EditorialBasketballIntakeController(Supplier<ReviewedEvidenceIntake> evidence,
                                               Supplier<CanonicalBasketballIntake> catalog, ObjectMapper json) {
        this.evidence = evidence;
        this.catalog = catalog;
        this.json = BasketballIntakeJson.strict(json);
    }

    @PostMapping(path = {"/api/v1/publisher/basketball/snapshots", "/api/v1/admin/basketball/snapshots"},
            consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> submit(@RequestBody(required = false) String body, Authentication authentication) {
        requireReviewer(authentication);
        ReviewedEvidenceIntake.SnapshotCommand command = parse(body, ReviewedEvidenceIntake.SnapshotCommand.class);
        return result(201, evidence.get().submit(command));
    }

    @GetMapping(path = {"/api/v1/publisher/basketball/evidence/{evidenceId}", "/api/v1/admin/basketball/evidence/{evidenceId}"})
    public ResponseEntity<?> read(@PathVariable String evidenceId, Authentication authentication) {
        requireReviewer(authentication);
        UUID id = UUID.fromString(evidenceId);
        return result(200, evidence.get().read(id));
    }

    @PostMapping(path = {"/api/v1/publisher/basketball/evidence/{evidenceId}:confirm", "/api/v1/admin/basketball/evidence/{evidenceId}:confirm"},
            consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> confirm(@PathVariable String evidenceId, @RequestBody(required = false) String body,
                                     Authentication authentication) {
        requireReviewer(authentication);
        ReviewedEvidenceIntake.ConfirmationCommand command = parse(body, ReviewedEvidenceIntake.ConfirmationCommand.class);
        UUID id = UUID.fromString(evidenceId);
        return result(201, evidence.get().confirm(id, command));
    }

    public record FactCommand(String kind, JsonNode payload, String rationale) {
        public FactCommand {
            Objects.requireNonNull(kind, "kind");
            Objects.requireNonNull(rationale, "rationale");
            if (payload == null || !payload.isObject()) {
                throw new IllegalArgumentException("one canonical object is required");
            }
            payload = payload.deepCopy();
        }

        @Override
        public JsonNode payload() {
            return payload == null ? null : payload.deepCopy();
        }
    }

    @PostMapping(path = {"/api/v1/publisher/basketball/facts", "/api/v1/admin/basketball/facts"}, consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> append(@RequestBody(required = false) String body, Authentication authentication) {
        requireReviewer(authentication);
        FactCommand command = parse(body, FactCommand.class);
        return result(201, catalog.get().append(command.kind(), command.payload(), command.rationale()));
    }

    private <T> T parse(String body, Class<T> type) {
        if (body == null || body.isBlank() || body.length() > 65536) {
            throw new IllegalArgumentException("one JSON command of at most 65536 characters is required");
        }
        return json.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .with(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
                .with(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES).readValue(body);
    }

    private static void requireReviewer(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (authentication.getAuthorities().stream().noneMatch(role -> ROLES.contains(role.getAuthority()))) {
            throw new SecurityException("publisher or admin required");
        }
    }

    @ExceptionHandler(EditorialProblemException.class)
    public ResponseEntity<ProblemDetails> authenticationFailure(EditorialProblemException failure, HttpServletRequest request) {
        return problem(failure.problemCode(), request);
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<ProblemDetails> forbidden(SecurityException failure, HttpServletRequest request) {
        return problem(ProblemCode.FORBIDDEN, request);
    }

    @ExceptionHandler({IllegalArgumentException.class, NullPointerException.class, JacksonException.class})
    public ResponseEntity<ProblemDetails> invalid(RuntimeException failure, HttpServletRequest request) {
        return problem(ProblemCode.INVALID_REQUEST, request);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ProblemDetails> conflict(IllegalStateException failure, HttpServletRequest request) {
        if (failure.getCause() != null) {
            throw failure;
        }
        return problem(ProblemCode.VERSION_CONFLICT, request);
    }

    private static <T> ResponseEntity<T> result(int status, T value) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff").header("X-Request-Id", "req-" + UUID.randomUUID()).body(value);
    }

    private static ResponseEntity<ProblemDetails> problem(ProblemCode code, HttpServletRequest request) {
        RequestId requestId = RequestId.of("req-" + UUID.randomUUID());
        return ResponseEntity.status(code.status()).contentType(MediaType.APPLICATION_PROBLEM_JSON).cacheControl(CacheControl.noStore())
                .header("X-Request-Id", requestId.value()).body(ProblemDetailsMapper.from(code, request.getRequestURI(), requestId, List.of()));
    }
}
