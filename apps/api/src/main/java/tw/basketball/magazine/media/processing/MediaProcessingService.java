package tw.basketball.magazine.media.processing;

import java.util.List;
import java.util.Objects;

import tw.basketball.magazine.media.storage.StorageVisibility;

/** Orchestrates validation, metadata removal, bounded variant encoding and state gating. */
public final class MediaProcessingService {
    private final MediaCompletionValidator validator;
    private final MediaMetadataSanitizer metadataSanitizer;
    private final MediaVariantEncoder variantEncoder;
    private final List<VariantSpec> variantSpecs;

    public MediaProcessingService(
            MediaCompletionValidator validator,
            MediaMetadataSanitizer metadataSanitizer,
            MediaVariantEncoder variantEncoder,
            List<VariantSpec> variantSpecs
    ) {
        this.validator = Objects.requireNonNull(validator, "validator");
        this.metadataSanitizer = Objects.requireNonNull(metadataSanitizer, "metadataSanitizer");
        this.variantEncoder = Objects.requireNonNull(variantEncoder, "variantEncoder");
        this.variantSpecs = boundedVariantSpecs(variantSpecs);
    }

    public MediaProcessingResult process(
            MediaProcessingState currentState,
            MediaCompletionRequest request
    ) {
        Objects.requireNonNull(currentState, "currentState");
        Objects.requireNonNull(request, "request");
        if (currentState != MediaProcessingState.PENDING
                && currentState != MediaProcessingState.PROCESSING) {
            throw new MediaValidationException(
                    MediaFailureReason.STATE,
                    "only pending or processing assets can complete"
            );
        }
        try {
            ValidatedMedia validated = validator.validate(request);
            SanitizedMedia sanitized = metadataSanitizer.sanitize(validated);
            List<MediaVariant> variants = variantSpecs.stream()
                    .map(spec -> encodeVariant(sanitized, spec))
                    .toList();
            return new MediaProcessingResult(
                    request.assetId(),
                    MediaProcessingState.READY,
                    null,
                    validated.sha256(),
                    variants,
                    sanitized.bytes()
            );
        } catch (MediaValidationException exception) {
            return failed(request, exception.reason());
        } catch (MediaVariantProcessingException exception) {
            return failed(request, MediaFailureReason.ENCODER);
        } catch (RuntimeException exception) {
            return failed(request, MediaFailureReason.ENCODER);
        }
    }

    private MediaVariant encodeVariant(SanitizedMedia media, VariantSpec spec) {
        try {
            MediaVariant variant = Objects.requireNonNull(
                    variantEncoder.encode(media, spec),
                    "variant encoder returned null"
            );
            if (!variant.name().equals(spec.name())
                    || !variant.mimeType().equals(spec.outputMimeType())
                    || variant.width() > spec.maxWidth()
                    || variant.height() > spec.maxHeight()
                    || variant.visibility() != StorageVisibility.PUBLIC_VARIANT) {
                throw new MediaVariantProcessingException("variant encoder exceeded configured bounds");
            }
            return variant;
        } catch (MediaVariantProcessingException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new MediaVariantProcessingException("variant encoder failed", exception);
        }
    }

    private static List<VariantSpec> boundedVariantSpecs(List<VariantSpec> specs) {
        Objects.requireNonNull(specs, "variantSpecs");
        if (specs.isEmpty() || specs.size() > 8) {
            throw new IllegalArgumentException("variantSpecs must contain 1 to 8 values");
        }
        return List.copyOf(specs);
    }

    private static MediaProcessingResult failed(
            MediaCompletionRequest request,
            MediaFailureReason reason
    ) {
        return new MediaProcessingResult(
                request.assetId(),
                MediaProcessingState.FAILED,
                reason,
                null,
                List.of(),
                new byte[0]
        );
    }
}
