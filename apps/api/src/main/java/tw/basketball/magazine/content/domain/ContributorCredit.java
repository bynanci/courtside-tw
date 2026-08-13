package tw.basketball.magazine.content.domain;

import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

/** Public, revision-scoped contributor identity and credit. */
public record ContributorCredit(
        UUID contributorId,
        String slug,
        String displayName,
        Role role
) {
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");

    public ContributorCredit {
        contributorId = Objects.requireNonNull(contributorId, "contributorId");
        slug = bounded(slug, "slug", 128);
        if (!SLUG.matcher(slug).matches()) {
            throw new IllegalArgumentException("slug must use the canonical public slug format");
        }
        displayName = bounded(displayName, "displayName", 200);
        role = Objects.requireNonNull(role, "role");
    }

    private static String bounded(String value, String name, int maximumLength) {
        value = Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximumLength
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(name + " must be bounded and free of control characters");
        }
        return value;
    }

    public enum Role {
        AUTHOR,
        EDITOR,
        PHOTOGRAPHER,
        ILLUSTRATOR,
        TRANSLATOR,
        DESIGNER
    }
}
