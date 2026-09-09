package tw.basketball.magazine.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.support.TransactionTemplate;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.shared.RequestId;

/** Real DB evidence of ordered signed-claim observations, not invented IdP admin events. */
class VerifiedRoleAuditServiceIT extends EditorialApiIntegrationTestSupport {
    private VerifiedRoleAuditService service;

    @BeforeEach
    void configureObservationService() {
        jdbcTemplate.execute("TRUNCATE identity_role_observation");
        service = new VerifiedRoleAuditService(jdbcTemplate, new JdbcAuditWriter(jdbcTemplate, JSON),
                new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                Clock.fixed(Instant.parse("2026-09-09T00:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void changedVerifiedClaimsAppendExactlyOnceAndOlderTokensCannotReverseHistory() {
        var reader = token("https://idp.example", "private-email@example.com", "READER", "2026-09-08T00:00:00Z");
        var editor = token("https://idp.example", "private-email@example.com", "EDITOR", "2026-09-08T01:00:00Z");
        service.observe(reader, RequestId.of("roles-first"));
        for (int retry = 0; retry < 10; retry++) {
            service.observe(editor, RequestId.of("roles-change-" + retry));
        }
        service.observe(reader, RequestId.of("roles-stale-token"));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE target_type = 'IDENTITY'", Integer.class));
        assertEquals(1, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'OBSERVED_ROLE_CLAIMS_CHANGED'", Integer.class));
        String events = jdbcTemplate.queryForList("SELECT actor_subject, metadata::text FROM audit_event").toString();
        assertFalse(events.contains("private-email"));
        assertFalse(events.contains("private-token"));
        assertFalse(events.contains("https://idp.example"));
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbcTemplate.update("DELETE FROM audit_event WHERE target_type = 'IDENTITY'"));
    }

    @Test
    void differentIssuersAreSeparateAndUnorderedFutureTokensDoNotInventTransitions() {
        service.observe(token("https://one.example", "same-subject", "READER", "2026-09-08T00:00:00Z"), RequestId.of("issuer-one"));
        service.observe(token("https://two.example", "same-subject", "ADMIN", "2026-09-08T00:00:00Z"), RequestId.of("issuer-two"));
        service.observe(token("https://one.example", "same-subject", "EDITOR", "2030-01-01T00:00:00Z"), RequestId.of("future-iat"));
        service.observe(token("https://one.example", "same-subject", "ADMIN", null), RequestId.of("missing-iat"));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT count(*) FROM identity_role_observation", Integer.class));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE action = 'OBSERVED_ROLE_CLAIMS_CHANGED'", Integer.class));
    }

    @Test
    void auditFailureRollsBackRoleObservationAndTheAttemptedEventTogether() {
        var failing = new VerifiedRoleAuditService(jdbcTemplate, draft -> {
            new JdbcAuditWriter(jdbcTemplate, JSON).append(draft);
            throw new IllegalStateException("audit delivery failed");
        }, new TransactionTemplate(new DataSourceTransactionManager(jdbcTemplate.getDataSource())),
                Clock.fixed(Instant.parse("2026-09-09T00:00:00Z"), ZoneOffset.UTC));
        assertThrows(IllegalStateException.class, () -> failing.observe(
                token("https://idp.example", "rollback-subject", "EDITOR", "2026-09-08T00:00:00Z"), RequestId.of("roles-rollback")));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM identity_role_observation", Integer.class));
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM audit_event WHERE target_type = 'IDENTITY'", Integer.class));
    }

    private static JwtAuthenticationToken token(String issuer, String subject, String role, String issuedAt) {
        Jwt.Builder jwt = Jwt.withTokenValue("private-token-canary").header("alg", "RS256")
                .issuer(issuer).subject(subject).expiresAt(Instant.parse("2031-01-01T00:00:00Z"));
        if (issuedAt != null) {
            jwt.issuedAt(Instant.parse(issuedAt));
        }
        return new JwtAuthenticationToken(jwt.build(), List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }
}
