package tw.basketball.magazine.media.processing;

/** Processing states mirrored by the foundation media_asset contract. */
public enum MediaProcessingState {
    PENDING,
    PROCESSING,
    READY,
    FAILED,
    REVOKED
}
