package tw.basketball.magazine.identity.api;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import tw.basketball.magazine.identity.application.AccountDataService;
import tw.basketball.magazine.identity.application.AccountProblemException;
import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.ApplicationClock;
import tools.jackson.databind.ObjectMapper;

/** Verified personal-data export and deletion surface. */
@RestController
public final class AccountController {
    private static final String BASE_PATH = "/api/v1/me";
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    private final Supplier<AccountDataService> serviceResolver;
    private volatile AccountDataService resolvedService;

    /**
     * Resolves persistence lazily because component scanning precedes JDBC
     * auto-configuration in the production application context.
     */
    @Autowired
    public AccountController(
            ObjectProvider<AccountDataService> serviceProvider,
            ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
            ObjectProvider<PlatformTransactionManager> transactionManagerProvider,
            ObjectProvider<AuditWriter> auditWriterProvider,
            ObjectProvider<ObjectMapper> objectMapperProvider
    ) {
        Objects.requireNonNull(serviceProvider, "serviceProvider");
        Objects.requireNonNull(jdbcTemplateProvider, "jdbcTemplateProvider");
        Objects.requireNonNull(transactionManagerProvider, "transactionManagerProvider");
        Objects.requireNonNull(auditWriterProvider, "auditWriterProvider");
        Objects.requireNonNull(objectMapperProvider, "objectMapperProvider");
        serviceResolver = () -> {
            AccountDataService configured = serviceProvider.getIfAvailable();
            return configured != null
                    ? configured
                    : resolveJdbcService(
                            jdbcTemplateProvider,
                            transactionManagerProvider,
                            auditWriterProvider,
                            objectMapperProvider
                    );
        };
    }

    AccountController(AccountDataService service) {
        AccountDataService fixed = Objects.requireNonNull(service, "service");
        serviceResolver = () -> fixed;
    }

    @GetMapping(path = BASE_PATH + "/export", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> export(
            Authentication authentication,
            HttpServletRequest request
    ) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId(request).value())
                .header("Content-Disposition", "attachment; filename=\"courtside-account.json\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(service().export(reader(authentication)));
    }

    @DeleteMapping(
            path = BASE_PATH,
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> delete(
            @RequestBody DeletionRequest input,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            Authentication authentication,
            HttpServletRequest request
    ) {
        RequestId requestId = requestId(request);
        return ResponseEntity.accepted()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId.value())
                .header("X-Content-Type-Options", "nosniff")
                .body(service().delete(
                        reader(authentication),
                        input != null && input.confirm(),
                        idempotencyKey,
                        requestId
                ));
    }

    private AccountDataService service() {
        AccountDataService service = serviceResolver.get();
        if (service == null) {
            throw new IllegalStateException("account persistence is unavailable");
        }
        return service;
    }

    private AccountDataService resolveJdbcService(
            ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
            ObjectProvider<PlatformTransactionManager> transactionManagerProvider,
            ObjectProvider<AuditWriter> auditWriterProvider,
            ObjectProvider<ObjectMapper> objectMapperProvider
    ) {
        AccountDataService current = resolvedService;
        if (current != null) {
            return current;
        }
        JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
        PlatformTransactionManager transactionManager = transactionManagerProvider.getIfAvailable();
        ObjectMapper objectMapper = objectMapperProvider.getIfAvailable();
        if (jdbcTemplate == null || transactionManager == null || objectMapper == null) {
            return null;
        }
        AuditWriter auditWriter = auditWriterProvider.getIfAvailable();
        if (auditWriter == null) {
            auditWriter = new JdbcAuditWriter(jdbcTemplate, objectMapper);
        }
        AccountDataService created = new AccountDataService(
                jdbcTemplate,
                transactionManager,
                auditWriter,
                ApplicationClock.systemUtc()
        );
        resolvedService = created;
        return created;
    }

    private static AuthenticatedReader reader(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication.getAuthorities().stream().noneMatch(
                        authority -> ("ROLE_" + RoleCode.READER.name()).equals(
                                authority.getAuthority()
                        )
                )) {
            throw new AccountProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        return AuthenticatedReader.from(authentication);
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

    public record DeletionRequest(boolean confirm) {
    }
}
