package tw.basketball.magazine.media.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.persistence.MediaAssetRepository;
import tw.basketball.magazine.media.persistence.MediaUploadIdempotencyRepository;
import tw.basketball.magazine.media.storage.MediaUploadRequest;
import tw.basketball.magazine.media.storage.S3CompatibleStoragePort;
import tw.basketball.magazine.media.storage.SignedUpload;
import tw.basketball.magazine.media.storage.StorageUploadPolicy;
import tw.basketball.magazine.outbox.OutboxEventDraft;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.UuidV7Generator;

/** Application boundary for bounded signed media uploads and completion. */
public final class EditorialMediaService {
    private static final String CREATE_OPERATION = "CREATE_UPLOAD";
    private static final String COMPLETE_OPERATION = "COMPLETE_UPLOAD";
    private static final String PROCESS_EVENT = "media.asset.process";
    private static final int MAX_FILENAME_LENGTH = 255;

    private final MediaAssetRepository assetRepository;
    private final MediaUploadIdempotencyRepository receiptRepository;
    private final S3CompatibleStoragePort storagePort;
    private final OutboxRepository outboxRepository;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final ApplicationClock applicationClock;
    private final StorageUploadPolicy uploadPolicy;
    private final UuidV7Generator idGenerator;

    public EditorialMediaService(
            MediaAssetRepository assetRepository,
            MediaUploadIdempotencyRepository receiptRepository,
            S3CompatibleStoragePort storagePort,
            OutboxRepository outboxRepository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            ApplicationClock applicationClock,
            StorageUploadPolicy uploadPolicy,
            UuidV7Generator idGenerator
    ) {
        this.assetRepository = Objects.requireNonNull(assetRepository, "assetRepository");
        this.receiptRepository = Objects.requireNonNull(receiptRepository, "receiptRepository");
        this.storagePort = Objects.requireNonNull(storagePort, "storagePort");
        this.outboxRepository = Objects.requireNonNull(outboxRepository, "outboxRepository");
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.applicationClock = Objects.requireNonNull(applicationClock, "applicationClock");
        this.uploadPolicy = Objects.requireNonNull(uploadPolicy, "uploadPolicy");
        this.idGenerator = Objects.requireNonNull(idGenerator, "idGenerator");
    }

    public OperationResult createUploadIntent(
            ActorContext actor,
            String idempotencyKey,
            String requestBody
    ) {
        requireRole(actor);
        String key = requireIdempotencyKey(idempotencyKey);
        JsonNode request = object(requestBody);
        String filename = requiredFilename(request);
        String mimeType = requiredMime(request);
        long byteSize = requiredSize(request);
        String checksum = requiredChecksum(request, "/checksumSha256");
        String requestHash = requestHash(CREATE_OPERATION, request);

        return transactionTemplate.execute(status -> {
            receiptRepository.lockScope(actor.subject(), CREATE_OPERATION, key);
            var existing = receiptRepository.find(actor.subject(), CREATE_OPERATION, key);
            if (existing.isPresent()) {
                return replayOrReject(existing.get(), requestHash);
            }

            UUID assetId = idGenerator.next();
            SignedUpload signedUpload = storagePort.createSignedUpload(
                    new MediaUploadRequest(assetId, mimeType, byteSize)
            );
            if (!assetId.equals(signedUpload.assetId())) {
                throw new IllegalStateException("storage signer changed the server-owned asset id");
            }
            MediaAssetRepository.PendingAsset pending = new MediaAssetRepository.PendingAsset(
                    assetId,
                    signedUpload.uploadId(),
                    filename,
                    signedUpload.storageKey(),
                    checksum,
                    mimeType,
                    byteSize,
                    signedUpload.expiresAt()
            );
            assetRepository.insertPending(pending);
            String response = json(Map.of(
                    "assetId", assetId,
                    "uploadUrl", signedUpload.url(),
                    "expiresAt", signedUpload.expiresAt(),
                    "maxSizeBytes", signedUpload.maxBytes(),
                    "version", 0,
                    "state", MediaProcessingState.PENDING.name()
            ));
            receiptRepository.insert(
                    actor.subject(), CREATE_OPERATION, key, requestHash, assetId, response
            );
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "MEDIA_UPLOAD_INTENT_CREATED",
                    "MEDIA_ASSET",
                    assetId,
                    Map.of("mimeType", mimeType, "byteSize", byteSize)
            ));
            return new OperationResult(201, response, 0, assetId);
        });
    }

    public OperationResult completeUpload(
            ActorContext actor,
            UUID assetId,
            String idempotencyKey,
            String requestBody
    ) {
        requireRole(actor);
        Objects.requireNonNull(assetId, "assetId");
        String key = requireIdempotencyKey(idempotencyKey);
        JsonNode request = object(requestBody);
        String checksum = requiredChecksum(request, "/checksumSha256");
        String mimeType = requiredMime(request);
        String requestHash = requestHash(COMPLETE_OPERATION + "|" + assetId, request);

        return transactionTemplate.execute(status -> {
            receiptRepository.lockScope(actor.subject(), COMPLETE_OPERATION, key);
            var existing = receiptRepository.find(actor.subject(), COMPLETE_OPERATION, key);
            if (existing.isPresent()) {
                return replayOrReject(existing.get(), requestHash);
            }

            MediaAssetRepository.MediaAssetRecord asset = assetRepository.find(assetId)
                    .orElseThrow(() -> EditorialProblemException.notFound(
                            "/id", "media asset was not found"
                    ));
            if (!asset.checksumSha256().equalsIgnoreCase(checksum)
                    || !asset.mimeType().equalsIgnoreCase(mimeType)) {
                throw EditorialProblemException.invalid(
                        "/checksumSha256",
                        "UPLOAD_CLAIM_MISMATCH",
                        "completion claims do not match the signed upload intent"
                );
            }
            if (asset.processingState() != MediaProcessingState.PENDING) {
                throw new EditorialProblemException(
                        ProblemCode.VERSION_CONFLICT,
                        List.of(new FieldError(
                                "/state",
                                "UPLOAD_NOT_PENDING",
                                "the upload has already been completed or revoked"
                        ))
                );
            }
            if (asset.uploadIntentExpiresAt() != null
                    && !applicationClock.now().isBefore(asset.uploadIntentExpiresAt())) {
                throw EditorialProblemException.invalid(
                        "/id",
                        "UPLOAD_INTENT_EXPIRED",
                        "the signed upload intent has expired"
                );
            }
            if (!assetRepository.markProcessing(assetId, asset.version())) {
                throw new EditorialProblemException(
                        ProblemCode.VERSION_CONFLICT,
                        List.of(new FieldError(
                                "/version", "MEDIA_VERSION_CONFLICT", "media state changed"
                        ))
                );
            }
            String eventKey = "media.process:" + assetId;
            String payload = json(Map.of(
                    "assetId", assetId,
                    "privateStorageKey", asset.privateStorageKey(),
                    "checksumSha256", asset.checksumSha256(),
                    "mimeType", asset.mimeType(),
                    "byteSize", asset.byteSize()
            ));
            outboxRepository.enqueue(new OutboxEventDraft(
                    PROCESS_EVENT,
                    "MEDIA_ASSET",
                    assetId,
                    eventKey,
                    payload,
                    applicationClock.now()
            ));
            MediaAssetRepository.MediaAssetRecord processing = assetRepository.find(assetId)
                    .orElseThrow(() -> new IllegalStateException("completed media asset disappeared"));
            String response = json(Map.of(
                    "operationId", idGenerator.next(),
                    "status", "ACCEPTED",
                    "version", processing.version(),
                    "assetId", assetId,
                    "state", processing.processingState().name()
            ));
            receiptRepository.insert(
                    actor.subject(), COMPLETE_OPERATION, key, requestHash, assetId, response
            );
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "MEDIA_UPLOAD_COMPLETED",
                    "MEDIA_ASSET",
                    assetId,
                    Map.of("eventType", PROCESS_EVENT, "state", "PROCESSING")
            ));
            return new OperationResult(202, response, processing.version(), assetId);
        });
    }

    private OperationResult replayOrReject(
            MediaUploadIdempotencyRepository.Receipt receipt,
            String requestHash
    ) {
        if (!MessageDigest.isEqual(
                receipt.requestHashSha256().getBytes(java.nio.charset.StandardCharsets.US_ASCII),
                requestHash.getBytes(java.nio.charset.StandardCharsets.US_ASCII)
        )) {
            throw new EditorialProblemException(
                    ProblemCode.VERSION_CONFLICT,
                    List.of(new FieldError(
                            "/idempotencyKey",
                            "IDEMPOTENCY_KEY_REUSE",
                            "the idempotency key is already bound to a different request"
                    ))
            );
        }
        try {
            JsonNode response = objectMapper.readTree(receipt.responseJson());
            JsonNode status = response.get("status");
            JsonNode version = response.get("version");
            int statusCode = status != null && "ACCEPTED".equals(status.asText()) ? 202 : 201;
            long responseVersion = version != null && version.isIntegralNumber()
                    ? version.asLong() : 0;
            return new OperationResult(
                    statusCode, receipt.responseJson(), responseVersion, receipt.assetId()
            );
        } catch (Exception exception) {
            throw new IllegalStateException("stored media receipt is not valid JSON", exception);
        }
    }

    private String requiredFilename(JsonNode request) {
        String value = requiredText(request, "filename", "/filename", MAX_FILENAME_LENGTH);
        if (value.contains("/") || value.contains("\\") || value.contains("..")) {
            throw EditorialProblemException.invalid(
                    "/filename", "FILENAME_INVALID", "filename must not contain a path"
            );
        }
        return value;
    }

    private String requiredMime(JsonNode request) {
        String value = requiredText(request, "contentType", "/contentType", 128)
                .toLowerCase(java.util.Locale.ROOT);
        if (!uploadPolicy.allowedMimeTypes().contains(value)) {
            throw EditorialProblemException.invalid(
                    "/contentType", "MIME_NOT_ALLOWED", "content type is not allowlisted"
            );
        }
        return value;
    }

    private long requiredSize(JsonNode request) {
        JsonNode value = request.get("sizeBytes");
        if (value == null || !value.isIntegralNumber()) {
            throw EditorialProblemException.invalid(
                    "/sizeBytes", "SIZE_REQUIRED", "sizeBytes must be an integer"
            );
        }
        long size = value.asLong();
        if (size < 1 || size > uploadPolicy.maximumBytes()) {
            throw EditorialProblemException.invalid(
                    "/sizeBytes", "SIZE_OUT_OF_RANGE", "sizeBytes is outside the upload limit"
            );
        }
        return size;
    }

    private String requiredChecksum(JsonNode request, String path) {
        String value = requiredText(request, "checksumSha256", path, 64)
                .toLowerCase(java.util.Locale.ROOT);
        if (!value.matches("[0-9a-f]{64}")) {
            throw EditorialProblemException.invalid(path, "CHECKSUM_INVALID", "checksumSha256 must be SHA-256");
        }
        return value;
    }

    private static String requiredText(JsonNode request, String field, String path, int maximum) {
        JsonNode value = request.get(field);
        if (value == null || !value.isTextual()) {
            throw EditorialProblemException.invalid(path, "FIELD_REQUIRED", field + " is required");
        }
        String text = value.asText().strip();
        if (text.isBlank() || text.length() > maximum
                || text.codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(path, "FIELD_INVALID", field + " is invalid");
        }
        return text;
    }

    private JsonNode object(String body) {
        if (body == null || body.isBlank()) {
            throw EditorialProblemException.invalid("/", "BODY_REQUIRED", "a JSON object is required");
        }
        try {
            JsonNode value = objectMapper.readTree(body);
            if (value == null || !value.isObject()) {
                throw EditorialProblemException.invalid("/", "OBJECT_REQUIRED", "request must be a JSON object");
            }
            return value;
        } catch (EditorialProblemException exception) {
            throw exception;
        } catch (Exception exception) {
            throw EditorialProblemException.invalid("/", "JSON_INVALID", "request JSON is invalid");
        }
    }

    private String requestHash(String operation, JsonNode request) {
        return sha256(operation + "\n" + json(request));
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize media response", exception);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the runtime", exception);
        }
    }

    private static String requireIdempotencyKey(String value) {
        if (value == null || value.isBlank() || value.length() > 512
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(
                    "/headers/Idempotency-Key", "IDEMPOTENCY_REQUIRED", "Idempotency-Key is required"
            );
        }
        return value;
    }

    private static void requireRole(ActorContext actor) {
        Objects.requireNonNull(actor, "actor");
        if (!actor.hasRole(RoleCode.EDITOR)) {
            throw EditorialProblemException.forbidden("/", "operation requires EDITOR role");
        }
    }

    public record OperationResult(int statusCode, String body, long version, UUID assetId) {
        public OperationResult {
            if (statusCode < 200 || statusCode > 299) {
                throw new IllegalArgumentException("media operation status must be successful");
            }
            Objects.requireNonNull(body, "body");
            Objects.requireNonNull(assetId, "assetId");
        }
    }
}
