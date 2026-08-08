package tw.basketball.magazine.shared;

import java.util.Objects;
import java.util.regex.Pattern;

/** A bounded, log-safe request correlation identifier. */
public record RequestId(String value) {
    private static final Pattern SAFE_VALUE = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,99}");

    public RequestId {
        value = Objects.requireNonNull(value, "value");
        if (!SAFE_VALUE.matcher(value).matches()) {
            throw new IllegalArgumentException("requestId must be a bounded log-safe token");
        }
    }

    public static RequestId of(String value) {
        return new RequestId(value);
    }
}
