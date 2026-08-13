package tw.basketball.magazine.content.application;

import java.util.Objects;

/** Deterministic mixed Chinese/Latin reading-time estimate. */
public final class ReadingTimeCalculator {
    private static final long WEIGHT_DENOMINATOR = 80_000L;
    private static final long CJK_CHARACTER_WEIGHT = 200L;
    private static final long OTHER_WORD_WEIGHT = 400L;

    private ReadingTimeCalculator() {
    }

    public static int estimateMinutes(String plainText) {
        Objects.requireNonNull(plainText, "plainText");
        long cjkCharacters = 0;
        long otherWords = 0;
        boolean inOtherWord = false;

        for (int offset = 0; offset < plainText.length();) {
            int codePoint = plainText.codePointAt(offset);
            offset += Character.charCount(codePoint);
            if (isCjk(codePoint)) {
                cjkCharacters++;
                inOtherWord = false;
            } else if (Character.isLetterOrDigit(codePoint)) {
                if (!inOtherWord) {
                    otherWords++;
                    inOtherWord = true;
                }
            } else {
                inOtherWord = false;
            }
        }

        long weightedUnits = cjkCharacters * CJK_CHARACTER_WEIGHT
                + otherWords * OTHER_WORD_WEIGHT;
        long minutes = Math.max(1L, (weightedUnits + WEIGHT_DENOMINATOR - 1L) / WEIGHT_DENOMINATOR);
        return Math.toIntExact(minutes);
    }

    private static boolean isCjk(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return script == Character.UnicodeScript.HAN
                || script == Character.UnicodeScript.HIRAGANA
                || script == Character.UnicodeScript.KATAKANA
                || script == Character.UnicodeScript.HANGUL;
    }
}
