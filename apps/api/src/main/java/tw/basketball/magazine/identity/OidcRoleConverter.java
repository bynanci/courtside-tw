package tw.basketball.magazine.identity;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.Jwt;

import tw.basketball.magazine.shared.RoleCode;

/**
 * Converts only the provider contract's canonical array-valued roles claim.
 *
 * <p>Scope, groups and prefixed role strings are deliberately not accepted as
 * editorial authority. Unknown or malformed role claims fail closed as an
 * invalid token instead of silently widening access.</p>
 */
public final class OidcRoleConverter implements Converter<Jwt, Collection<GrantedAuthority>> {
    public static final String ROLES_CLAIM = "roles";
    public static final String AUTHORITY_PREFIX = "ROLE_";

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        Objects.requireNonNull(jwt, "jwt");
        Object claim = jwt.getClaims().get(ROLES_CLAIM);
        if (claim == null) {
            return List.of();
        }
        if (!(claim instanceof Collection<?> values)) {
            throw invalidRolesClaim();
        }

        Set<GrantedAuthority> authorities = new LinkedHashSet<>();
        for (Object value : values) {
            if (!(value instanceof String roleValue)
                    || roleValue.isBlank()
                    || roleValue.codePoints().anyMatch(Character::isISOControl)) {
                throw invalidRolesClaim();
            }
            RoleCode role;
            try {
                role = RoleCode.valueOf(roleValue);
            } catch (IllegalArgumentException exception) {
                throw invalidRolesClaim();
            }
            authorities.add(new SimpleGrantedAuthority(AUTHORITY_PREFIX + role.name()));
        }
        return List.copyOf(authorities);
    }

    private static OAuth2AuthenticationException invalidRolesClaim() {
        return new OAuth2AuthenticationException(new OAuth2Error(
                "invalid_token",
                "The OIDC roles claim is not canonical.",
                null
        ));
    }
}
