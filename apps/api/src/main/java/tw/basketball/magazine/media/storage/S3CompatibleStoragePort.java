package tw.basketball.magazine.media.storage;

/** Provider-neutral boundary for constrained S3-compatible media uploads. */
@FunctionalInterface
public interface S3CompatibleStoragePort {
    SignedUpload createSignedUpload(MediaUploadRequest request);
}
