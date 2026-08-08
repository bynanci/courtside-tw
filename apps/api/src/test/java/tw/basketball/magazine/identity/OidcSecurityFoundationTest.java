package tw.basketball.magazine.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import tw.basketball.magazine.shared.RoleCode;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;

final class OidcSecurityFoundationTest {
    private static final String ISSUER = "https://issuer.example.test";
    private static final String AUDIENCE = "courtside-api";
    private static final OidcRoleConverter ROLE_CONVERTER = new OidcRoleConverter();

    @Test
    void rejectsTokenFromUnexpectedIssuer() {
        OAuth2TokenValidator<Jwt> validator = OidcSecurityConfiguration.tokenValidator(ISSUER, AUDIENCE);

        assertTrue(validator.validate(token("https://attacker.example.test", AUDIENCE, Instant.now().plusSeconds(300)))
                .hasErrors());
    }

    @Test
    void rejectsTokenForUnexpectedAudience() {
        OAuth2TokenValidator<Jwt> validator = OidcSecurityConfiguration.tokenValidator(ISSUER, AUDIENCE);

        assertTrue(validator.validate(token(ISSUER, "another-service", Instant.now().plusSeconds(300)))
                .hasErrors());
    }

    @Test
    void rejectsExpiredToken() {
        OAuth2TokenValidator<Jwt> validator = OidcSecurityConfiguration.tokenValidator(ISSUER, AUDIENCE);

        assertTrue(validator.validate(expiredToken()).hasErrors());
    }

    @Test
    void missingRoleDoesNotAuthorizeReaderPolicy() {
        Collection<GrantedAuthority> authorities = ROLE_CONVERTER.convert(
                token(ISSUER, AUDIENCE, Instant.now().plusSeconds(300))
        );

        assertTrue(authorities.isEmpty());
        assertFalse(OidcRolePolicy.allows(authorities, RoleCode.READER));
    }

    @Test
    void mapsOnlyCanonicalRolesAndDoesNotImplyHigherPrivilege() {
        Collection<GrantedAuthority> authorities = ROLE_CONVERTER.convert(
                tokenWithRoles(ISSUER, AUDIENCE, List.of("EDITOR"))
        );

        assertEquals(Set.of(OidcRolePolicy.authority(RoleCode.EDITOR)), authorities.stream()
                .map(GrantedAuthority::getAuthority)
                .collect(java.util.stream.Collectors.toSet()));
        assertTrue(OidcRolePolicy.allows(authorities, RoleCode.EDITOR));
        assertFalse(OidcRolePolicy.allows(authorities, RoleCode.PUBLISHER));
        assertFalse(OidcRolePolicy.allows(authorities, RoleCode.ADMIN));
    }

    @Test
    void rejectsPrefixedUnknownAndScalarRoleClaimsInsteadOfEscalating() {
        assertThrows(
                OAuth2AuthenticationException.class,
                () -> ROLE_CONVERTER.convert(tokenWithRoles(ISSUER, AUDIENCE, List.of("ROLE_PUBLISHER")))
        );
        assertThrows(
                OAuth2AuthenticationException.class,
                () -> ROLE_CONVERTER.convert(tokenWithRoles(ISSUER, AUDIENCE, List.of("OWNER")))
        );
        assertThrows(
                OAuth2AuthenticationException.class,
                () -> ROLE_CONVERTER.convert(tokenWithRoles(ISSUER, AUDIENCE, "PUBLISHER"))
        );

        Collection<GrantedAuthority> scopeOnly = ROLE_CONVERTER.convert(
                tokenWithScope(ISSUER, AUDIENCE, "ROLE_PUBLISHER")
        );
        assertTrue(scopeOnly.isEmpty());
        assertFalse(OidcRolePolicy.allows(scopeOnly, RoleCode.PUBLISHER));
    }

    private static Jwt expiredToken() {
        Instant now = Instant.now();
        return Jwt.withTokenValue("test-only-token")
                .header("alg", "RS256")
                .claim("iss", ISSUER)
                .claim("sub", "reader-1")
                .claim("aud", List.of(AUDIENCE))
                .issuedAt(now.minusSeconds(600))
                .expiresAt(now.minusSeconds(300))
                .build();
    }

    private static Jwt token(String issuer, String audience, Instant expiresAt) {
        return Jwt.withTokenValue("test-only-token")
                .header("alg", "RS256")
                .claim("iss", issuer)
                .claim("sub", "reader-1")
                .claim("aud", List.of(audience))
                .issuedAt(Instant.now().minusSeconds(60))
                .expiresAt(expiresAt)
                .build();
    }

    private static Jwt tokenWithRoles(String issuer, String audience, Object roles) {
        return Jwt.withTokenValue("test-only-token")
                .header("alg", "RS256")
                .claim("iss", issuer)
                .claim("sub", "reader-1")
                .claim("aud", List.of(audience))
                .claim("roles", roles)
                .issuedAt(Instant.now().minusSeconds(60))
                .expiresAt(Instant.now().plusSeconds(300))
                .build();
    }

    private static Jwt tokenWithScope(String issuer, String audience, String scope) {
        return Jwt.withTokenValue("test-only-token")
                .header("alg", "RS256")
                .claim("iss", issuer)
                .claim("sub", "reader-1")
                .claim("aud", List.of(audience))
                .claim("scope", scope)
                .issuedAt(Instant.now().minusSeconds(60))
                .expiresAt(Instant.now().plusSeconds(300))
                .build();
    }
}
