package tw.basketball.magazine.media.application;

import java.util.Objects;
import java.util.UUID;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.media.persistence.MediaAssetRepository;
import tw.basketball.magazine.media.processing.MediaCompletionRequest;
import tw.basketball.magazine.media.processing.MediaProcessingService;
import tw.basketball.magazine.media.processing.MediaProcessingState;
import tw.basketball.magazine.media.storage.PrivateObjectReader;
import tw.basketball.magazine.outbox.OutboxEvent;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxEventHandler;

/** Worker-side, at-least-once media completion handler. */
public final class EditorialMediaOutboxHandler implements OutboxEventHandler {
    public static final String EVENT_TYPE = "media.asset.process";

    private final MediaAssetRepository assetRepository;
    private final PrivateObjectReader privateObjectReader;
    private final MediaProcessingService processingService;
    private final ObjectMapper objectMapper;

    public EditorialMediaOutboxHandler(
            MediaAssetRepository assetRepository,
            PrivateObjectReader privateObjectReader,
            MediaProcessingService processingService,
            ObjectMapper objectMapper
    ) {
        this.assetRepository = Objects.requireNonNull(assetRepository, "assetRepository");
        this.privateObjectReader = Objects.requireNonNull(privateObjectReader, "privateObjectReader");
        this.processingService = Objects.requireNonNull(processingService, "processingService");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public void handle(OutboxEvent event) throws OutboxHandlerException {
        if (!EVENT_TYPE.equals(event.eventType()) || !"MEDIA_ASSET".equals(event.aggregateType())) {
            throw new OutboxHandlerException("media handler received an unexpected event", false);
        }
        Payload payload = payload(event.payloadJson());
        MediaAssetRepository.MediaAssetRecord current = assetRepository.find(payload.assetId())
                .orElseThrow(() -> new OutboxHandlerException(
                        "media asset no longer exists", false
                ));
        if (current.processingState() == tw.basketball.magazine.media.domain.MediaProcessingState.READY
                || current.processingState() == tw.basketball.magazine.media.domain.MediaProcessingState.FAILED
                || current.processingState() == tw.basketball.magazine.media.domain.MediaProcessingState.REVOKED) {
            return;
        }
        if (current.processingState() != tw.basketball.magazine.media.domain.MediaProcessingState.PROCESSING) {
            throw new OutboxHandlerException("media asset is not processing", false);
        }

        final byte[] bytes;
        try {
            bytes = PrivateObjectReader.requireBytes(privateObjectReader.read(payload.privateStorageKey()));
        } catch (Exception exception) {
            throw new OutboxHandlerException("private original could not be read", exception, true);
        }
        var result = processingService.process(
                MediaProcessingState.PROCESSING,
                new MediaCompletionRequest(
                        payload.assetId(),
                        payload.mimeType(),
                        payload.byteSize(),
                        payload.checksumSha256(),
                        bytes
                )
        );
        if (!assetRepository.recordProcessingResult(payload.assetId(), current.version(), result)) {
            throw new OutboxHandlerException("media processing version changed", true);
        }
    }

    private Payload payload(String value) throws OutboxHandlerException {
        try {
            JsonNode node = objectMapper.readTree(value);
            if (node == null || !node.isObject()) {
                throw new IllegalArgumentException("payload must be an object");
            }
            return new Payload(
                    UUID.fromString(text(node, "assetId")),
                    text(node, "privateStorageKey"),
                    text(node, "checksumSha256"),
                    text(node, "mimeType"),
                    longValue(node, "byteSize")
            );
        } catch (JacksonException | IllegalArgumentException exception) {
            throw new OutboxHandlerException("media processing payload is invalid", exception, false);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString() || value.asString().isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.asString();
    }

    private static long longValue(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isIntegralNumber() || value.asLong() < 1) {
            throw new IllegalArgumentException(field + " must be positive");
        }
        return value.asLong();
    }

    private record Payload(
            UUID assetId,
            String privateStorageKey,
            String checksumSha256,
            String mimeType,
            long byteSize
    ) {
    }
}
