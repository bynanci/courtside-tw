package tw.basketball.magazine.publication.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.publication.domain.PublicationState;
import tw.basketball.magazine.publication.persistence.EditorialIssueRepository;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;

/** Application boundary for issue draft CRUD and optimistic-lock conflicts. */
public final class EditorialIssueService {
    private static final int MAX_SECTIONS = 50;
    private final EditorialIssueRepository repository;
    private final AuditWriter auditWriter;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;
    private final ApplicationClock applicationClock;

    public EditorialIssueService(
            EditorialIssueRepository repository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper
    ) {
        this(repository, auditWriter, transactionTemplate, objectMapper, ApplicationClock.systemUtc());
    }

    public EditorialIssueService(
            EditorialIssueRepository repository,
            AuditWriter auditWriter,
            TransactionTemplate transactionTemplate,
            ObjectMapper objectMapper,
            ApplicationClock applicationClock
    ) {
        this.repository = Objects.requireNonNull(repository, "repository");
        this.auditWriter = Objects.requireNonNull(auditWriter, "auditWriter");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.applicationClock = Objects.requireNonNull(applicationClock, "applicationClock");
    }

    public EditorialWorkflowService.OperationResult createIssue(
            ActorContext actor,
            String idempotencyKey,
            String body
    ) {
        requireEditor(actor);
        JsonNode request = object(body);
        String title = requiredText(request, "title", "/title", 250);
        String slug = requiredText(request, "slug", "/slug", 128);
        validateSlug(slug);
        String summary = request.has("description")
                ? requiredText(request, "description", "/description", 1000)
                : title;
        UUID coverAssetId = requiredUuid(request, "coverAssetId", "/coverAssetId");
        String hash = requestHash("CREATE_ISSUE", request);
        return idempotent(actor, "CREATE_ISSUE", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord issue = repository.insertDraft(
                    title, slug, summary, coverAssetId
            );
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "ISSUE_CREATED",
                    "ISSUE",
                    issue.issueId(),
                    metadata(issue)
            ));
            return new EditorialWorkflowService.OperationResult(
                    201, json(issueJson(issue)), issue.version()
            );
        });
    }

    public EditorialWorkflowService.OperationResult listIssues(ActorContext actor, int limit) {
        requireEditor(actor);
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        List<Map<String, Object>> items = repository.list(boundedLimit).stream()
                .map(this::issueJson)
                .toList();
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("nextCursor", null);
        page.put("limit", boundedLimit);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("page", page);
        return new EditorialWorkflowService.OperationResult(200, json(response), 0);
    }

    public EditorialWorkflowService.OperationResult submitIssue(
            ActorContext actor,
            UUID issueId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requireEditor(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = body == null || body.isBlank()
                ? objectMapper.createObjectNode()
                : object(body);
        String hash = requestHash(
                "SUBMIT_ISSUE|" + issueId + "|" + expectedVersion.value(), request
        );
        return idempotent(actor, "SUBMIT", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireIssue(issueId, expectedVersion);
            if (current.state() != PublicationState.DRAFT) {
                throw new tw.basketball.magazine.publication.domain.PublicationWorkflowException(
                        "INVALID_TRANSITION", "only a draft issue can be submitted"
                );
            }
            transitionIssue(issueId, current, PublicationState.IN_REVIEW, expectedVersion);
            repository.appendReview(issueId, actor.subject(), RoleCode.EDITOR.name(), "SUBMITTED", null);
            EditorialIssueRepository.IssueRecord updated = requireIssue(issueId);
            auditWriter.append(new AuditEventDraft(
                    actor, "ISSUE_SUBMITTED", "ISSUE", issueId, metadata(updated)
            ));
            return workflowResult("IN_REVIEW", updated.version(), null);
        });
    }

    public EditorialWorkflowService.OperationResult approveIssue(
            ActorContext actor,
            UUID issueId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requirePublisher(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = body == null || body.isBlank()
                ? objectMapper.createObjectNode()
                : object(body);
        String hash = requestHash(
                "APPROVE_ISSUE|" + issueId + "|" + expectedVersion.value(), request
        );
        return idempotent(actor, "APPROVE", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireIssue(issueId, expectedVersion);
            if (current.state() != PublicationState.IN_REVIEW) {
                throw new tw.basketball.magazine.publication.domain.PublicationWorkflowException(
                        "INVALID_TRANSITION", "only an issue in review can be approved"
                );
            }
            transitionIssue(issueId, current, PublicationState.APPROVED, expectedVersion);
            repository.appendReview(issueId, actor.subject(), RoleCode.PUBLISHER.name(), "APPROVED", null);
            EditorialIssueRepository.IssueRecord updated = requireIssue(issueId);
            auditWriter.append(new AuditEventDraft(
                    actor, "ISSUE_APPROVED", "ISSUE", issueId, metadata(updated)
            ));
            return workflowResult("APPROVED", updated.version(), null);
        });
    }

    public EditorialWorkflowService.OperationResult publishIssue(
            ActorContext actor,
            UUID issueId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requirePublisher(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = body == null || body.isBlank()
                ? objectMapper.createObjectNode()
                : object(body);
        String hash = requestHash(
                "PUBLISH_ISSUE|" + issueId + "|" + expectedVersion.value(), request
        );
        return idempotent(actor, "PUBLISH", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireIssue(issueId, expectedVersion);
            if (current.state() != PublicationState.APPROVED
                    && current.state() != PublicationState.SCHEDULED) {
                throw new tw.basketball.magazine.publication.domain.PublicationWorkflowException(
                        "INVALID_TRANSITION", "issue must be approved or scheduled before publishing"
                );
            }
            Instant publishedAt = applicationClock.now();
            if (!repository.readyForPublication(issueId, publishedAt)) {
                throw EditorialProblemException.gate(
                        "/coverAssetId",
                        "ISSUE_NOT_READY",
                        "issue cover must be ready, have a cover variant, alt text, and valid public rights"
                );
            }
            if (!repository.transition(
                    issueId,
                    current.version(),
                    current.state(),
                    PublicationState.PUBLISHED,
                    publishedAt
            )) {
                throw new tw.basketball.magazine.shared.VersionConflictException(
                        expectedVersion,
                        repository.find(issueId).map(issue -> new Version(issue.version()))
                                .orElse(expectedVersion)
                );
            }
            EditorialIssueRepository.IssueRecord updated = requireIssue(issueId);
            JsonNode snapshot = object(repository.publicationSnapshotDocument(issueId));
            repository.appendPublicationSnapshot(
                    issueId,
                    repository.nextSnapshotVersion(issueId),
                    snapshot,
                    sha256(snapshot.toString()),
                    actor.subject(),
                    updated.coverAssetId()
            );
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "ISSUE_PUBLISHED",
                    "ISSUE",
                    issueId,
                    metadata(updated)
            ));
            return workflowResult("PUBLISHED", updated.version(), null);
        });
    }

    public EditorialWorkflowService.OperationResult scheduleIssue(
            ActorContext actor,
            UUID issueId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requirePublisher(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        ScheduleInput schedule = parseSchedule(body);
        JsonNode request = object(body);
        String hash = requestHash(
                "SCHEDULE_ISSUE|" + issueId + "|" + expectedVersion.value(), request
        );
        return idempotent(actor, "SCHEDULE", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireIssue(issueId, expectedVersion);
            if (current.state() != PublicationState.APPROVED) {
                throw new tw.basketball.magazine.publication.domain.PublicationWorkflowException(
                        "INVALID_TRANSITION", "only an approved issue can be scheduled"
                );
            }
            if (!schedule.publishAt().isAfter(applicationClock.now())) {
                throw new tw.basketball.magazine.publication.domain.PublicationWorkflowException(
                        "SCHEDULE_TIME_INVALID", "scheduled publication must be in the future"
                );
            }
            if (!repository.transition(
                    issueId,
                    current.version(),
                    current.state(),
                    PublicationState.SCHEDULED,
                    null
            )) {
                throw new tw.basketball.magazine.shared.VersionConflictException(
                        expectedVersion,
                        repository.find(issueId).map(issue -> new Version(issue.version()))
                                .orElse(expectedVersion)
                );
            }
            repository.insertPublicationJob(
                    issueId,
                    "SCHEDULE",
                    idempotencyKey,
                    actor.subject(),
                    schedule.publishAt(),
                    schedule.timezone()
            );
            EditorialIssueRepository.IssueRecord updated = requireIssue(issueId);
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "ISSUE_SCHEDULED",
                    "ISSUE",
                    issueId,
                    Map.of(
                            "version", updated.version(),
                            "scheduledAt", schedule.publishAt().toString(),
                            "timezone", schedule.timezone()
                    )
            ));
            return workflowResult("SCHEDULED", updated.version(), schedule.publishAt());
        });
    }

    public EditorialWorkflowService.OperationResult listSections(ActorContext actor, UUID issueId) {
        requireEditor(actor);
        EditorialIssueRepository.IssueRecord issue = repository.find(issueId)
                .orElseThrow(() -> EditorialProblemException.notFound(
                        "/issueId", "issue was not found"
                ));
        return sectionsResult(issue);
    }

    public EditorialWorkflowService.OperationResult createSection(
            ActorContext actor,
            UUID issueId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requireEditor(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = object(body);
        String title = requiredText(request, "title", "/title", 250);
        Integer requestedPosition = optionalPosition(request, "position", "/position");
        String hash = requestHash("CREATE_SECTION:" + issueId, request);
        return idempotent(actor, "CREATE_SECTION", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireEditableIssue(issueId, expectedVersion);
            List<EditorialIssueRepository.SectionRecord> sections = repository.listSections(issueId);
            int position = requestedPosition == null ? sections.size() + 1 : requestedPosition;
            if (position < 1 || position > sections.size() + 1 || sections.size() >= MAX_SECTIONS) {
                throw EditorialProblemException.invalid(
                        "/position", "SECTION_POSITION_INVALID",
                        "position must be within the current section range"
                );
            }
            int offset = sectionOffset(sections);
            repository.shiftSectionsForInsert(issueId, position, offset);
            repository.insertSection(issueId, title, position);
            EditorialIssueRepository.IssueRecord updated = advanceIssue(issueId, current.version());
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "SECTION_CREATED",
                    "ISSUE",
                    issueId,
                    sectionMetadata(updated, title, position)
            ));
            return sectionsResult(updated, 201);
        });
    }

    public EditorialWorkflowService.OperationResult reorderSections(
            ActorContext actor,
            UUID issueId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requireEditor(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = object(body);
        List<EditorialIssueRepository.SectionPosition> requested = parseSectionPositions(request);
        String hash = requestHash("REORDER_SECTIONS:" + issueId, request);
        return idempotent(actor, "REORDER_SECTIONS", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireEditableIssue(issueId, expectedVersion);
            List<EditorialIssueRepository.SectionRecord> existing = repository.listSections(issueId);
            validateSectionOrder(existing, requested);
            if (!hasSectionPositionChange(existing, requested)) {
                return sectionsResult(current);
            }
            repository.applySectionPositions(issueId, requested, sectionOffset(existing));
            EditorialIssueRepository.IssueRecord updated = advanceIssue(issueId, current.version());
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "SECTIONS_REORDERED",
                    "ISSUE",
                    issueId,
                    Map.of("version", updated.version(), "sectionCount", requested.size())
            ));
            return sectionsResult(updated);
        });
    }

    public EditorialWorkflowService.OperationResult patchSection(
            ActorContext actor,
            UUID issueId,
            UUID sectionId,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requireEditor(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = object(body);
        String title = requiredText(request, "title", "/title", 250);
        String hash = requestHash("PATCH_SECTION:" + issueId + ":" + sectionId, request);
        return idempotent(actor, "PATCH_SECTION", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireEditableIssue(issueId, expectedVersion);
            requireSection(issueId, sectionId);
            if (!repository.updateSectionTitle(issueId, sectionId, title)) {
                throw EditorialProblemException.notFound("/sectionId", "section was not found");
            }
            EditorialIssueRepository.IssueRecord updated = advanceIssue(issueId, current.version());
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "SECTION_RENAMED",
                    "ISSUE",
                    issueId,
                    sectionMetadata(updated, title, null)
            ));
            return sectionsResult(updated);
        });
    }

    public EditorialWorkflowService.OperationResult deleteSection(
            ActorContext actor,
            UUID issueId,
            UUID sectionId,
            Version expectedVersion,
            String idempotencyKey
    ) {
        requireEditor(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        String hash = sha256("DELETE_SECTION|" + issueId + "|" + sectionId);
        return idempotent(actor, "DELETE_SECTION", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = requireEditableIssue(issueId, expectedVersion);
            List<EditorialIssueRepository.SectionRecord> existing = repository.listSections(issueId);
            requireSection(issueId, sectionId);
            if (repository.countArticles(issueId, sectionId) > 0) {
                throw EditorialProblemException.invalid(
                        "/sectionId", "SECTION_NOT_EMPTY", "sections with articles cannot be deleted"
                );
            }
            if (!repository.deleteSection(issueId, sectionId)) {
                throw EditorialProblemException.notFound("/sectionId", "section was not found");
            }
            List<EditorialIssueRepository.SectionPosition> remaining = new ArrayList<>();
            int position = 1;
            for (EditorialIssueRepository.SectionRecord section : existing) {
                if (!section.sectionId().equals(sectionId)) {
                    remaining.add(new EditorialIssueRepository.SectionPosition(
                            section.sectionId(), position++
                    ));
                }
            }
            repository.applySectionPositions(issueId, remaining, sectionOffset(existing));
            EditorialIssueRepository.IssueRecord updated = advanceIssue(issueId, current.version());
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "SECTION_DELETED",
                    "ISSUE",
                    issueId,
                    Map.of("version", updated.version(), "sectionId", sectionId.toString())
            ));
            return sectionsResult(updated);
        });
    }

    public EditorialWorkflowService.OperationResult patchIssue(
            ActorContext actor,
            Version expectedVersion,
            String idempotencyKey,
            String body
    ) {
        requireEditor(actor);
        Objects.requireNonNull(expectedVersion, "expectedVersion");
        JsonNode request = object(body);
        UUID issueId = requiredUuid(request, "issueId", "/issueId");
        JsonNode changes = request.get("changes");
        if (changes == null || !changes.isObject() || changes.size() == 0) {
            throw EditorialProblemException.invalid(
                    "/changes", "CHANGES_REQUIRED", "changes must be a non-empty object"
            );
        }
        String hash = requestHash("PATCH_ISSUE", request);
        return idempotent(actor, "PATCH_ISSUE", idempotencyKey, hash, () -> {
            EditorialIssueRepository.IssueRecord current = repository.find(issueId)
                    .orElseThrow(() -> EditorialProblemException.notFound(
                            "/issueId", "issue was not found"
                    ));
            if (current.version() != expectedVersion.value()) {
                throw new tw.basketball.magazine.shared.VersionConflictException(
                        expectedVersion, new Version(current.version())
                );
            }
            String title = changedText(changes, "title", "/changes/title", current.title(), 250);
            String slug = changedText(changes, "slug", "/changes/slug", current.slug(), 128);
            validateSlug(slug);
            String summary = changedText(
                    changes, "description", "/changes/description", current.summary(), 1000
            );
            UUID coverAssetId = changes.has("coverAssetId")
                    ? requiredUuid(changes, "coverAssetId", "/changes/coverAssetId")
                    : current.coverAssetId();
            if (!repository.updateDraft(
                    issueId, expectedVersion.value(), title, slug, summary, coverAssetId
            )) {
                EditorialIssueRepository.IssueRecord latest = repository.find(issueId)
                        .orElseThrow(() -> EditorialProblemException.notFound(
                                "/issueId", "issue was not found"
                        ));
                throw new tw.basketball.magazine.shared.VersionConflictException(
                        expectedVersion, new Version(latest.version())
                );
            }
            EditorialIssueRepository.IssueRecord updated = repository.find(issueId)
                    .orElseThrow(() -> new IllegalStateException("updated issue was not readable"));
            auditWriter.append(new AuditEventDraft(
                    actor,
                    "ISSUE_DRAFT_PATCHED",
                    "ISSUE",
                    issueId,
                    metadata(updated)
            ));
            return new EditorialWorkflowService.OperationResult(200, json(issueJson(updated)), updated.version());
        });
    }

    private EditorialWorkflowService.OperationResult idempotent(
            ActorContext actor,
            String operation,
            String idempotencyKey,
            String hash,
            Supplier<EditorialWorkflowService.OperationResult> work
    ) {
        validateIdempotencyKey(idempotencyKey);
        EditorialWorkflowService.OperationResult result = transactionTemplate.execute(status -> {
            repository.lockIdempotencyScope(actor.subject(), operation, idempotencyKey);
            var existing = repository.findIdempotency(actor.subject(), operation, idempotencyKey);
            if (existing.isPresent()) {
                if (!existing.get().requestHashSha256().equals(hash)) {
                    throw new EditorialProblemException(
                            ProblemCode.VERSION_CONFLICT,
                            List.of(new FieldError(
                                    "/Idempotency-Key",
                                    "IDEMPOTENCY_KEY_REUSE",
                                    "the idempotency key is already bound to another request"
                            ))
                    );
                }
                String replayBody = canonicalJson(existing.get().response());
                return new EditorialWorkflowService.OperationResult(
                        operation.equals("PUBLISH")
                                || operation.equals("SCHEDULE")
                                || operation.equals("SUBMIT")
                                || operation.equals("APPROVE")
                                ? 202
                                : operation.startsWith("CREATE") ? 201 : 200,
                        replayBody,
                        versionFrom(replayBody)
                );
            }
            EditorialWorkflowService.OperationResult computed = work.get();
            repository.insertIdempotency(
                    actor.subject(), operation, idempotencyKey, hash, computed.body()
            );
            String persistedBody = repository.findIdempotency(actor.subject(), operation, idempotencyKey)
                    .orElseThrow(() -> new IllegalStateException("issue receipt disappeared"))
                    .response();
            return new EditorialWorkflowService.OperationResult(
                    computed.statusCode(), canonicalJson(persistedBody), computed.version()
            );
        });
        return Objects.requireNonNull(result, "transaction returned no issue result");
    }

    private void transitionIssue(
            UUID issueId,
            EditorialIssueRepository.IssueRecord current,
            PublicationState nextState,
            Version expectedVersion
    ) {
        if (!repository.transition(
                issueId,
                current.version(),
                current.state(),
                nextState,
                null
        )) {
            throw new tw.basketball.magazine.shared.VersionConflictException(
                    expectedVersion,
                    repository.find(issueId).map(issue -> new Version(issue.version()))
                            .orElse(expectedVersion)
            );
        }
    }

    private Map<String, Object> issueJson(EditorialIssueRepository.IssueRecord issue) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("issueId", issue.issueId().toString());
        value.put("issueNumber", issue.issueNumber());
        value.put("version", issue.version());
        value.put("title", issue.title());
        value.put("slug", issue.slug());
        value.put("description", issue.summary());
        value.put("coverAssetId", issue.coverAssetId().toString());
        value.put("state", issue.state().name());
        return value;
    }

    private EditorialWorkflowService.OperationResult sectionsResult(
            EditorialIssueRepository.IssueRecord issue
    ) {
        return sectionsResult(issue, 200);
    }

    private EditorialWorkflowService.OperationResult sectionsResult(
            EditorialIssueRepository.IssueRecord issue,
            int statusCode
    ) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("issueId", issue.issueId().toString());
        response.put("issueVersion", issue.version());
        response.put("sections", repository.listSections(issue.issueId()).stream()
                .map(this::sectionJson)
                .toList());
        return new EditorialWorkflowService.OperationResult(statusCode, json(response), issue.version());
    }

    private Map<String, Object> sectionJson(EditorialIssueRepository.SectionRecord section) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("sectionId", section.sectionId().toString());
        value.put("title", section.title());
        value.put("position", section.position());
        value.put("articleCount", section.articleCount());
        value.put("version", section.version());
        return value;
    }

    private EditorialIssueRepository.IssueRecord requireEditableIssue(
            UUID issueId,
            Version expectedVersion
    ) {
        EditorialIssueRepository.IssueRecord issue = repository.findForUpdate(issueId)
                .orElseThrow(() -> EditorialProblemException.notFound(
                        "/issueId", "issue was not found"
                ));
        if (issue.version() != expectedVersion.value()) {
            throw new tw.basketball.magazine.shared.VersionConflictException(
                    expectedVersion, new Version(issue.version())
            );
        }
        if (issue.state() != PublicationState.DRAFT) {
            throw EditorialProblemException.invalid(
                    "/issueId", "ISSUE_NOT_EDITABLE", "only draft issues can change sections"
            );
        }
        return issue;
    }

    private EditorialIssueRepository.IssueRecord requireIssue(UUID issueId) {
        return repository.find(issueId).orElseThrow(() -> EditorialProblemException.notFound(
                "/id", "issue was not found"
        ));
    }

    private EditorialIssueRepository.IssueRecord requireIssue(UUID issueId, Version expectedVersion) {
        EditorialIssueRepository.IssueRecord issue = repository.findForUpdate(issueId)
                .orElseThrow(() -> EditorialProblemException.notFound("/id", "issue was not found"));
        if (issue.version() != expectedVersion.value()) {
            throw new tw.basketball.magazine.shared.VersionConflictException(
                    expectedVersion, new Version(issue.version())
            );
        }
        return issue;
    }

    private EditorialWorkflowService.OperationResult workflowResult(
            String status,
            long version,
            Instant scheduledAt
    ) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("operationId", UUID.randomUUID().toString());
        response.put("status", status);
        response.put("version", version);
        if (scheduledAt != null) {
            response.put("scheduledAt", scheduledAt.toString());
        }
        return new EditorialWorkflowService.OperationResult(202, json(response), version);
    }

    private EditorialIssueRepository.SectionRecord requireSection(UUID issueId, UUID sectionId) {
        return repository.listSections(issueId).stream()
                .filter(section -> section.sectionId().equals(sectionId))
                .findFirst()
                .orElseThrow(() -> EditorialProblemException.notFound(
                        "/sectionId", "section was not found"
                ));
    }

    private EditorialIssueRepository.IssueRecord advanceIssue(UUID issueId, long expectedVersion) {
        if (!repository.bumpIssueVersion(issueId, expectedVersion)) {
            EditorialIssueRepository.IssueRecord latest = repository.find(issueId)
                    .orElseThrow(() -> EditorialProblemException.notFound(
                            "/issueId", "issue was not found"
                    ));
            throw new tw.basketball.magazine.shared.VersionConflictException(
                    new Version(expectedVersion), new Version(latest.version())
            );
        }
        return repository.find(issueId)
                .orElseThrow(() -> new IllegalStateException("updated issue was not readable"));
    }

    private static Integer optionalPosition(JsonNode request, String field, String path) {
        JsonNode value = request.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        return requiredPosition(value, path);
    }

    private static int requiredPosition(JsonNode value, String path) {
        if (value == null || !value.isIntegralNumber()
                || value.asLong() < 1 || value.asLong() > MAX_SECTIONS) {
            throw EditorialProblemException.invalid(
                    path, "SECTION_POSITION_INVALID", "position must be a bounded positive integer"
            );
        }
        return value.asInt();
    }

    private static List<EditorialIssueRepository.SectionPosition> parseSectionPositions(JsonNode request) {
        JsonNode sections = request.get("sections");
        if (sections == null || !sections.isArray() || sections.size() > MAX_SECTIONS) {
            throw EditorialProblemException.invalid(
                    "/sections", "SECTIONS_REQUIRED", "sections must be a bounded array"
            );
        }
        List<EditorialIssueRepository.SectionPosition> positions = new ArrayList<>();
        for (int index = 0; index < sections.size(); index++) {
            JsonNode section = sections.get(index);
            if (section == null || !section.isObject()) {
                throw EditorialProblemException.invalid(
                        "/sections/" + index, "SECTION_INVALID", "section entry must be an object"
                );
            }
            positions.add(new EditorialIssueRepository.SectionPosition(
                    requiredUuid(section, "sectionId", "/sections/" + index + "/sectionId"),
                    requiredPosition(section.get("position"), "/sections/" + index + "/position")
            ));
        }
        return positions;
    }

    private static void validateSectionOrder(
            List<EditorialIssueRepository.SectionRecord> existing,
            List<EditorialIssueRepository.SectionPosition> requested
    ) {
        if (existing.size() != requested.size()) {
            throw EditorialProblemException.invalid(
                    "/sections", "SECTION_SET_MISMATCH", "all issue sections must be included"
            );
        }
        Set<UUID> existingIds = existing.stream()
                .map(EditorialIssueRepository.SectionRecord::sectionId)
                .collect(java.util.stream.Collectors.toSet());
        Set<UUID> requestedIds = new HashSet<>();
        boolean[] seenPositions = new boolean[requested.size() + 1];
        for (EditorialIssueRepository.SectionPosition position : requested) {
            if (!existingIds.contains(position.sectionId()) || !requestedIds.add(position.sectionId())) {
                throw EditorialProblemException.invalid(
                        "/sections", "SECTION_SET_MISMATCH", "section ids must belong to this issue"
                );
            }
            if (position.position() > requested.size() || seenPositions[position.position()]) {
                throw EditorialProblemException.invalid(
                        "/sections", "SECTION_POSITION_INVALID", "positions must be unique and contiguous"
                );
            }
            seenPositions[position.position()] = true;
        }
        if (!existingIds.equals(requestedIds)) {
            throw EditorialProblemException.invalid(
                    "/sections", "SECTION_SET_MISMATCH", "all issue sections must be included"
            );
        }
    }

    private static boolean hasSectionPositionChange(
            List<EditorialIssueRepository.SectionRecord> existing,
            List<EditorialIssueRepository.SectionPosition> requested
    ) {
        Map<UUID, Integer> current = new java.util.HashMap<>();
        existing.forEach(section -> current.put(section.sectionId(), section.position()));
        return requested.stream().anyMatch(
                position -> !Objects.equals(current.get(position.sectionId()), position.position())
        );
    }

    private static int sectionOffset(List<EditorialIssueRepository.SectionRecord> sections) {
        int maximum = sections.stream()
                .mapToInt(EditorialIssueRepository.SectionRecord::position)
                .max()
                .orElse(0);
        return Math.addExact(Math.addExact(maximum, sections.size()), 1);
    }

    private static Map<String, Object> sectionMetadata(
            EditorialIssueRepository.IssueRecord issue,
            String title,
            Integer position
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("version", issue.version());
        metadata.put("title", title);
        if (position != null) {
            metadata.put("position", position);
        }
        return metadata;
    }

    private static Map<String, Object> metadata(EditorialIssueRepository.IssueRecord issue) {
        return Map.of(
                "version", issue.version(),
                "state", issue.state().name()
        );
    }

    private JsonNode object(String body) {
        if (body == null || body.isBlank()) {
            throw EditorialProblemException.invalid("/", "JSON_REQUIRED", "a JSON object is required");
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            if (node == null || !node.isObject()) {
                throw EditorialProblemException.invalid("/", "OBJECT_REQUIRED", "request must be an object");
            }
            return node;
        } catch (EditorialProblemException exception) {
            throw exception;
        } catch (JacksonException exception) {
            throw EditorialProblemException.invalid("/", "JSON_INVALID", "request JSON is invalid");
        }
    }

    private static String requiredText(JsonNode request, String field, String path, int maxLength) {
        JsonNode value = request.get(field);
        if (value == null || !value.isString()) {
            throw EditorialProblemException.invalid(path, "TEXT_REQUIRED", field + " is required");
        }
        String text = value.asString().strip();
        if (text.isBlank() || text.length() > maxLength
                || text.codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(path, "TEXT_INVALID", field + " is invalid");
        }
        return text;
    }

    private static String changedText(
            JsonNode changes,
            String field,
            String path,
            String current,
            int maxLength
    ) {
        return changes.has(field) ? requiredText(changes, field, path, maxLength) : current;
    }

    private static UUID requiredUuid(JsonNode request, String field, String path) {
        String value = requiredText(request, field, path, 80);
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw EditorialProblemException.invalid(path, "UUID_INVALID", "value must be a UUID");
        }
    }

    private static void validateSlug(String slug) {
        if (!slug.matches("^[a-z0-9]+(?:-[a-z0-9]+)*$")) {
            throw EditorialProblemException.invalid(
                    "/slug", "SLUG_INVALID", "slug must contain lower-case letters, numbers, and hyphens"
            );
        }
    }

    private static void requireEditor(ActorContext actor) {
        Objects.requireNonNull(actor, "actor");
        if (!actor.authenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (!actor.hasRole(RoleCode.EDITOR)) {
            throw EditorialProblemException.forbidden("/roles", "operation requires role EDITOR");
        }
    }

    private static void requirePublisher(ActorContext actor) {
        Objects.requireNonNull(actor, "actor");
        if (!actor.authenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        if (!actor.hasRole(RoleCode.PUBLISHER)) {
            throw EditorialProblemException.forbidden("/roles", "operation requires role PUBLISHER");
        }
    }

    private static void validateIdempotencyKey(String value) {
        if (value == null || value.isBlank() || value.length() > 512
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw EditorialProblemException.invalid(
                    "/Idempotency-Key", "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required"
            );
        }
    }

    private ScheduleInput parseSchedule(String body) {
        JsonNode request = object(body);
        String rawPublishAt = requiredText(request, "publishAt", "/publishAt", 80);
        String timezone = requiredText(request, "timezone", "/timezone", 128);
        ZoneId zone;
        try {
            zone = ZoneId.of(timezone);
        } catch (DateTimeException exception) {
            throw EditorialProblemException.invalid(
                    "/timezone", "TIMEZONE_INVALID", "timezone must be a valid IANA timezone"
            );
        }
        try {
            return new ScheduleInput(parseInstant(rawPublishAt, zone), timezone);
        } catch (DateTimeException exception) {
            throw EditorialProblemException.invalid(
                    "/publishAt", "SCHEDULE_TIME_INVALID",
                    "publishAt must be an ISO local or offset date-time"
            );
        }
    }

    private static Instant parseInstant(String value, ZoneId zone) {
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeException ignored) {
            return LocalDateTime.parse(value).atZone(zone).toInstant();
        }
    }

    private String requestHash(String operation, JsonNode request) {
        try {
            return sha256(operation + "|" + objectMapper.writeValueAsString(request));
        } catch (Exception exception) {
            throw new IllegalStateException("unable to hash issue request", exception);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize issue response", exception);
        }
    }

    private String canonicalJson(String value) {
        try {
            return json(objectMapper.readTree(value));
        } catch (JacksonException exception) {
            throw new IllegalStateException("stored issue receipt is not valid JSON", exception);
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

    private static long versionFrom(String body) {
        int marker = body.indexOf("\"issueVersion\":");
        int markerLength = "\"issueVersion\":".length();
        if (marker < 0) {
            marker = body.indexOf("\"version\":");
            markerLength = "\"version\":".length();
        }
        if (marker < 0) {
            return 0;
        }
        int start = marker + markerLength;
        int end = start;
        while (end < body.length() && Character.isDigit(body.charAt(end))) {
            end++;
        }
        try {
            return Long.parseLong(body.substring(start, end));
        } catch (RuntimeException exception) {
            return 0;
        }
    }

    private record ScheduleInput(Instant publishAt, String timezone) {
        private ScheduleInput {
            Objects.requireNonNull(publishAt, "publishAt");
            Objects.requireNonNull(timezone, "timezone");
        }
    }
}
