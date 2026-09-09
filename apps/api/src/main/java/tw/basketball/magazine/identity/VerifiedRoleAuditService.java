package tw.basketball.magazine.identity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.support.TransactionTemplate;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/** Observes verified, newer JWT authority sets; never claims to be an IdP admin event feed. */
public final class VerifiedRoleAuditService {
    private final JdbcTemplate jdbc;
    private final AuditWriter audit;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public VerifiedRoleAuditService(JdbcTemplate jdbc, AuditWriter audit, TransactionTemplate transactions, Clock clock) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public void observe(JwtAuthenticationToken authentication, RequestId requestId) {
        if (!authentication.isAuthenticated() || authentication.getToken().getIssuer() == null
                || authentication.getToken().getSubject() == null) {
            return;
        }
        Instant issuedAt = authentication.getToken().getIssuedAt();
        // Missing/future iat cannot establish an ordered change history. Permission
        // failures are still audited separately; no provider event is fabricated.
        if (issuedAt == null || issuedAt.isAfter(clock.instant())) {
            return;
        }
        String identity = identityDigest(authentication);
        Set<String> roles = roles(authentication);
        transactions.executeWithoutResult(transaction -> {
            int inserted = jdbc.update("""
                    INSERT INTO identity_role_observation (identity_digest, roles, token_issued_at)
                    VALUES (?, ?::text[], ?) ON CONFLICT (identity_digest) DO NOTHING
                    """, identity, array(roles), Timestamp.from(issuedAt));
            Observation previous = jdbc.queryForObject("""
                    SELECT roles, token_issued_at FROM identity_role_observation
                    WHERE identity_digest = ? FOR UPDATE
                    """, (rs, row) -> new Observation(new TreeSet<>(Arrays.asList((String[]) rs.getArray("roles").getArray())),
                            rs.getTimestamp("token_issued_at").toInstant()), identity);
            Objects.requireNonNull(previous, "observation disappeared");
            ActorContext actor = ActorContext.user(identity, Set.of(), requestId);
            if (inserted == 1) {
                audit.append(new AuditEventDraft(actor, "OBSERVED_ROLE_CLAIMS_INITIALIZED", "IDENTITY", null,
                        Map.of("roles", roles, "tokenIssuedAt", issuedAt, "source", "VERIFIED_JWT_OBSERVATION")));
                return;
            }
            if (!issuedAt.isAfter(previous.issuedAt())) {
                return;
            }
            if (!roles.equals(previous.roles())) {
                audit.append(new AuditEventDraft(actor, "OBSERVED_ROLE_CLAIMS_CHANGED", "IDENTITY", null,
                        Map.of("previousRoles", previous.roles(), "roles", roles, "tokenIssuedAt", issuedAt,
                                "source", "VERIFIED_JWT_OBSERVATION")));
            }
            jdbc.update("""
                    UPDATE identity_role_observation SET roles = ?::text[], token_issued_at = ?,
                        observed_at = transaction_timestamp() WHERE identity_digest = ?
                    """, array(roles), Timestamp.from(issuedAt), identity);
        });
    }

    static String identityDigest(JwtAuthenticationToken authentication) {
        try {
            String issuer = authentication.getToken().getIssuer().toString();
            String subject = authentication.getToken().getSubject();
            // Length framing avoids ambiguous concatenations without persisting issuer or subject.
            String framed = issuer.length() + ":" + issuer + subject.length() + ":" + subject;
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(framed.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private static Set<String> roles(JwtAuthenticationToken authentication) {
        Set<String> result = new TreeSet<>();
        for (RoleCode role : RoleCode.values()) {
            if (authentication.getAuthorities().stream().anyMatch(authority -> ("ROLE_" + role.name()).equals(authority.getAuthority()))) {
                result.add(role.name());
            }
        }
        return result;
    }

    private static String array(Set<String> roles) {
        return "{" + String.join(",", roles) + "}";
    }

    private record Observation(Set<String> roles, Instant issuedAt) { }
}
