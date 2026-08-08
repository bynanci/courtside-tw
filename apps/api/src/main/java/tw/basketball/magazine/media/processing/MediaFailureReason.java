package tw.basketball.magazine.media.processing;

/** Bounded failure vocabulary safe for metrics and audit metadata. */
public enum MediaFailureReason {
    EMPTY_CONTENT,
    SIZE,
    MIME,
    MAGIC_BYTES,
    CHECKSUM,
    METADATA,
    ENCODER,
    STATE
}
