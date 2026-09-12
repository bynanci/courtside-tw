package tw.basketball.magazine.provenance.api;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.provenance.application.ProvenanceService;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;

/** Separate optional read. Failing this endpoint never changes origin issue/article reads. */
@RestController
public final class PublicProvenanceController {
    private final ObjectProvider<JdbcTemplate> jdbc;
    private final ObjectProvider<PlatformTransactionManager> manager;
    private final ObjectMapper json;
    private final boolean enabled;
    public PublicProvenanceController(ObjectProvider<JdbcTemplate> jdbc,
            ObjectProvider<PlatformTransactionManager> manager, ObjectMapper json,
            @Value("${courtside.web3.provenance:false}") boolean enabled) {
        this.jdbc = jdbc; this.manager = manager; this.json = json; this.enabled = enabled;
    }
    @GetMapping("/api/v1/public/issues/{issueSlug}/provenance")
    public ResponseEntity<?> get(@PathVariable String issueSlug) {
        if (!issueSlug.matches("[a-z0-9]+(-[a-z0-9]+)*") || issueSlug.length() > 128) {
            return problem(ProblemCode.INVALID_REQUEST);
        }
        JdbcTemplate database = jdbc.getIfAvailable();
        PlatformTransactionManager transactions = manager.getIfAvailable();
        if (!enabled || database == null || transactions == null) {
            return problem(ProblemCode.RESOURCE_NOT_FOUND);
        }
        ProvenanceService service = new ProvenanceService(database, new TransactionTemplate(transactions), json, Clock.systemUTC());
        return service.publicIssue(issueSlug).<ResponseEntity<?>>map(value -> ResponseEntity.ok()
                .cacheControl(CacheControl.noStore()).header("X-Request-Id", "req-" + UUID.randomUUID()).body(value))
                .orElseGet(() -> problem(ProblemCode.RESOURCE_NOT_FOUND));
    }
    private static ResponseEntity<ProblemDetails> problem(ProblemCode code) {
        RequestId requestId = RequestId.of("req-" + UUID.randomUUID());
        ProblemDetails problem = ProblemDetailsMapper.from(code, "/api/v1/public/issues/provenance", requestId, List.of());
        return ResponseEntity.status(problem.status()).cacheControl(CacheControl.noStore())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON).header("X-Request-Id", requestId.value()).body(problem);
    }
}
