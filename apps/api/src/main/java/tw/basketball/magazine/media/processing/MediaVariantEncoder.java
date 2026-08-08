package tw.basketball.magazine.media.processing;

/** Provider-neutral image encoder capability; implementations must emit only a configured variant. */
@FunctionalInterface
public interface MediaVariantEncoder {
    MediaVariant encode(SanitizedMedia media, VariantSpec spec);
}
