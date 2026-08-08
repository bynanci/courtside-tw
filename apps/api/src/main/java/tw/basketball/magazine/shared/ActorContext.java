package tw.basketball.magazine.shared;

import java.util.Objects;
import java.util.Set;

/**
 * Immutable actor metadata passed through application services. It deliberately
 * contains no access token, cookie, session secret or provider credential.
 */
public record ActorContext(
        ActorType type,
        String subject,
        Set<RoleCode> roles,
        RequestId requestId
) {
    private static final String ANONYMOUS_SUBJECT = "anonymous";

    public ActorContext {
        type = Objects.requireNonNull(type, "type");
        subject = requireSubject(subject);
        roles = Set.copyOf(Objects.requireNonNull(roles, "roles"));
        requestId = Objects.requireNonNull(requestId, "requestId");
        if (type == ActorType.ANONYMOUS) {
            if (!ANONYMOUS_SUBJECT.equals(subject) || !roles.isEmpty()) {
                throw new IllegalArgumentException("anonymous actor identity must not carry roles");
            }
        }
    }

    public static ActorContext anonymous(RequestId requestId) {
        return new ActorContext(ActorType.ANONYMOUS, ANONYMOUS_SUBJECT, Set.of(), requestId);
    }

    public static ActorContext system(RequestId requestId) {
        return new ActorContext(ActorType.SYSTEM, "system", Set.of(), requestId);
    }

    public static ActorContext service(String subject, RequestId requestId) {
        return new ActorContext(ActorType.SERVICE, subject, Set.of(), requestId);
    }

    public static ActorContext user(String subject, Set<RoleCode> roles, RequestId requestId) {
        return new ActorContext(ActorType.USER, subject, roles, requestId);
    }

    public boolean hasRole(RoleCode role) {
        return roles.contains(Objects.requireNonNull(role, "role"));
    }

    public boolean authenticated() {
        return type != ActorType.ANONYMOUS;
    }

    private static String requireSubject(String value) {
        Objects.requireNonNull(value, "subject");
        if (value.isBlank() || value.length() > 512 || containsControlCharacter(value)) {
            throw new IllegalArgumentException("actor subject must be bounded and free of control characters");
        }
        return value;
    }

    private static boolean containsControlCharacter(String value) {
        return value.codePoints().anyMatch(codePoint -> Character.isISOControl(codePoint));
    }
}
