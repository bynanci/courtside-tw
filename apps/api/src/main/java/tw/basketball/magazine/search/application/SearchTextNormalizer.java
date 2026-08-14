package tw.basketball.magazine.search.application;

import java.text.Normalizer;
import java.util.Locale;

/** Shared Unicode normalization for projection writes and public search reads. */
public final class SearchTextNormalizer {
    private SearchTextNormalizer() {
    }

    public static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String canonical = Normalizer.normalize(value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT);
        StringBuilder normalized = new StringBuilder(canonical.length());
        boolean separatorPending = false;
        for (int offset = 0; offset < canonical.length();) {
            int codePoint = canonical.codePointAt(offset);
            offset += Character.charCount(codePoint);
            int type = Character.getType(codePoint);
            boolean searchable = Character.isLetterOrDigit(codePoint)
                    || type == Character.NON_SPACING_MARK
                    || type == Character.COMBINING_SPACING_MARK;
            if (searchable) {
                if (separatorPending && !normalized.isEmpty()) {
                    normalized.append(' ');
                }
                normalized.appendCodePoint(codePoint);
                separatorPending = false;
            } else if (!normalized.isEmpty()) {
                separatorPending = true;
            }
        }
        return normalized.toString();
    }
}
