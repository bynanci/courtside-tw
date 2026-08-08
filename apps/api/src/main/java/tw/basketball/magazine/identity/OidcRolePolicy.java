package tw.basketball.magazine.identity;

import java.util.Collection;
import java.util.Objects;

import org.springframework.security.core.GrantedAuthority;

import tw.basketball.magazine.shared.RoleCode;

/**
 * Deny-by-default role policy with no implicit hierarchy.
 *
 * <p>An EDITOR is not a PUBLISHER, and an ADMIN is not silently expanded into
 * another role. A principal receives only the authorities explicitly present
 * in the validated canonical roles claim.</p>
 */
public final class OidcRolePolicy {
    private OidcRolePolicy() {
    }

    public static String authority(RoleCode role) {
        return OidcRoleConverter.AUTHORITY_PREFIX + Objects.requireNonNull(role, "role").name();
    }

    public static boolean allows(
            Collection<? extends GrantedAuthority> authorities,
            RoleCode requiredRole
    ) {
        Objects.requireNonNull(authorities, "authorities");
        String requiredAuthority = authority(requiredRole);
        return authorities.stream()
                .filter(Objects::nonNull)
                .map(GrantedAuthority::getAuthority)
                .anyMatch(requiredAuthority::equals);
    }
}
