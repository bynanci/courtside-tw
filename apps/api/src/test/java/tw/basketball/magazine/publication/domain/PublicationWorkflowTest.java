package tw.basketball.magazine.publication.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import tw.basketball.magazine.media.domain.MediaProcessingState;
import tw.basketball.magazine.media.domain.RightsPolicy;
import tw.basketball.magazine.publication.application.PublicationReadinessService;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

final class PublicationWorkflowTest {
    private static final UUID ARTICLE_ID = UUID.fromString("00000000-0000-4000-8000-000000000401");
    private static final UUID ARTICLE_REVISION_ID = UUID.fromString("00000000-0000-4000-8000-000000000403");
    private static final UUID ASSET_ID = UUID.fromString("00000000-0000-4000-8000-000000000402");
    private static final UUID RIGHTS_ID = UUID.fromString("00000000-0000-4000-8000-000000000404");
    private static final Instant CHECKED_AT = Instant.parse("2026-08-09T00:00:00Z");
    private static final Instant PUBLISH_AT = CHECKED_AT.plusSeconds(3600);

    private final PublicationWorkflow workflow = new PublicationWorkflow(new PublicationReadinessService());

    @Test
    void editorSubmitsAndPublisherApprovesOnlyAfterRightsAreReady() {
        PublicationWorkflow.PublicationSnapshot draft = snapshot(
                PublicationState.DRAFT,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflow.PublicationResult submitted = workflow.apply(
                draft,
                command(PublicationAction.SUBMIT, RoleCode.EDITOR, new Version(0), CHECKED_AT)
        );
        PublicationWorkflow.PublicationResult approved = workflow.apply(
                submitted.snapshot(),
                command(PublicationAction.APPROVE, RoleCode.PUBLISHER, new Version(1), CHECKED_AT)
        );

        assertEquals(PublicationState.IN_REVIEW, submitted.snapshot().state());
        assertEquals(PublicationState.APPROVED, approved.snapshot().state());
        assertEquals(new Version(2), approved.snapshot().version());
        assertEquals(ARTICLE_REVISION_ID, approved.snapshot().revisionId());
    }

    @Test
    void publisherCanRequestChangesBackToDraftWithReason() {
        PublicationWorkflow.PublicationSnapshot inReview = snapshot(
                PublicationState.IN_REVIEW,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflow.PublicationResult result = workflow.apply(
                inReview,
                PublicationWorkflow.PublicationCommand.withReason(
                        PublicationAction.REQUEST_CHANGES,
                        RoleCode.PUBLISHER,
                        new Version(0),
                        ARTICLE_REVISION_ID,
                        CHECKED_AT,
                        "Add the missing game context."
                )
        );

        assertEquals(PublicationState.DRAFT, result.snapshot().state());
        assertEquals(PublicationWorkflow.PublicationResult.Status.CHANGES_REQUESTED, result.status());
        assertEquals(new Version(1), result.snapshot().version());
        assertEquals(ARTICLE_REVISION_ID, result.snapshot().revisionId());
    }

    @Test
    void requestChangesRequiresReason() {
        PublicationWorkflowException error = assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        snapshot(PublicationState.IN_REVIEW, true, rights(
                                RightsPolicy.Status.VALID,
                                Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL)
                        )),
                        PublicationWorkflow.PublicationCommand.withReason(
                                PublicationAction.REQUEST_CHANGES,
                                RoleCode.PUBLISHER,
                                new Version(0),
                                ARTICLE_REVISION_ID,
                                CHECKED_AT,
                                ""
                        )
                )
        );

        assertEquals("REVIEW_REASON_REQUIRED", error.code());
    }

    @Test
    void missingRightsBlocksSubmitWithoutAdvancingVersionAndKeepsAssetId() {
        PublicationWorkflow.PublicationSnapshot draft = snapshot(
                PublicationState.DRAFT,
                true,
                new PublicationReadinessService.MediaRequirement(
                        ASSET_ID,
                        MediaProcessingState.READY,
                        List.of()
                )
        );

        PublicationWorkflow.PublicationResult result = workflow.apply(
                draft,
                command(PublicationAction.SUBMIT, RoleCode.EDITOR, new Version(0), CHECKED_AT)
        );

        assertEquals(PublicationWorkflow.PublicationResult.Status.BLOCKED, result.status());
        assertEquals(List.of("RIGHTS_MISSING"), result.blockingCodes());
        assertEquals(ASSET_ID, result.blockers().get(0).assetId());
        assertEquals(draft, result.snapshot());
    }

    @ParameterizedTest
    @CsvSource({
            "SUBMIT,DRAFT,EDITOR,UNKNOWN,PUBLIC_WEB,RIGHTS_MISSING",
            "SUBMIT,DRAFT,EDITOR,VALID,OFFLINE,RIGHTS_WRONG_CHANNEL",
            "PUBLISH,APPROVED,PUBLISHER,UNKNOWN,PUBLIC_WEB,RIGHTS_MISSING",
            "PUBLISH,APPROVED,PUBLISHER,VALID,OFFLINE,RIGHTS_WRONG_CHANNEL",
            "PUBLISH,SCHEDULED,PUBLISHER,UNKNOWN,PUBLIC_WEB,RIGHTS_MISSING",
            "PUBLISH,SCHEDULED,PUBLISHER,VALID,OFFLINE,RIGHTS_WRONG_CHANNEL"
    })
    void unknownAndWrongChannelRightsBlockSubmitAndExecutionWithoutAdvancingTheSnapshot(
            PublicationAction action,
            PublicationState state,
            RoleCode role,
            RightsPolicy.Status rightsStatus,
            String channel,
            String blockingCode
    ) {
        PublicationWorkflow.PublicationSnapshot current = new PublicationWorkflow.PublicationSnapshot(
                ARTICLE_ID,
                ARTICLE_REVISION_ID,
                state,
                new Version(7),
                true,
                List.of(rights(rightsStatus, Set.of(channel))),
                state == PublicationState.SCHEDULED ? PUBLISH_AT : null
        );

        PublicationWorkflow.PublicationResult blocked = workflow.apply(
                current,
                command(action, role, new Version(7), PUBLISH_AT)
        );

        assertEquals(PublicationWorkflow.PublicationResult.Status.BLOCKED, blocked.status());
        assertEquals(List.of(blockingCode), blocked.blockingCodes());
        assertEquals(ASSET_ID, blocked.blockers().getFirst().assetId());
        assertEquals(RIGHTS_ID, blocked.blockers().getFirst().rightsRecordId());
        assertEquals(Long.valueOf(3), blocked.blockers().getFirst().rightsRecordVersion());
        assertEquals(current, blocked.snapshot());
        assertEquals(new Version(7), blocked.snapshot().version());
    }

    @ParameterizedTest
    @CsvSource({
            "APPROVE,IN_REVIEW,APPROVED",
            "PUBLISH,APPROVED,PUBLISHED",
            "WITHDRAW,PUBLISHED,WITHDRAWN",
            "ARCHIVE,WITHDRAWN,ARCHIVED"
    })
    void onlyPublisherCanApprovePublishWithdrawAndArchive(
            PublicationAction action,
            PublicationState initialState,
            PublicationState expectedState
    ) {
        PublicationWorkflow.PublicationSnapshot current = snapshot(
                initialState,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflowException denied = assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(current, PublicationWorkflow.PublicationCommand.withReason(
                        action, RoleCode.EDITOR, new Version(0), ARTICLE_REVISION_ID,
                        CHECKED_AT, "Emergency rights withdrawal"
                ))
        );

        assertEquals("ROLE_REQUIRED", denied.code());
        assertEquals(initialState, current.state());
        assertEquals(new Version(0), current.version());

        PublicationWorkflow.PublicationResult accepted = workflow.apply(
                current,
                PublicationWorkflow.PublicationCommand.withReason(
                        action, RoleCode.PUBLISHER, new Version(0), ARTICLE_REVISION_ID,
                        CHECKED_AT, "Emergency rights withdrawal"
                )
        );

        assertEquals(expectedState, accepted.snapshot().state());
        assertEquals(new Version(1), accepted.snapshot().version());
        assertEquals(ARTICLE_REVISION_ID, accepted.snapshot().revisionId());
    }

    @Test
    void nonReadyMediaBlocksEvenWhenRightsAreValid() {
        PublicationWorkflow.PublicationSnapshot draft = snapshot(
                PublicationState.DRAFT,
                true,
                new PublicationReadinessService.MediaRequirement(
                        ASSET_ID,
                        MediaProcessingState.PROCESSING,
                        List.of(rightsRecord(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL)))
                )
        );

        PublicationWorkflow.PublicationResult result = workflow.apply(
                draft,
                command(PublicationAction.SUBMIT, RoleCode.EDITOR, new Version(0), CHECKED_AT)
        );

        assertEquals(List.of("MEDIA_NOT_READY"), result.blockingCodes());
        assertEquals(ASSET_ID, result.blockers().get(0).assetId());
        assertEquals(draft, result.snapshot());
    }

    @Test
    void publisherCanScheduleThenPublishOnlyWhenDue() {
        PublicationWorkflow.PublicationSnapshot approved = snapshot(
                PublicationState.APPROVED,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflow.PublicationResult scheduled = workflow.apply(
                approved,
                PublicationWorkflow.PublicationCommand.scheduled(
                        RoleCode.PUBLISHER,
                        new Version(0),
                        ARTICLE_REVISION_ID,
                        CHECKED_AT,
                        PUBLISH_AT
                )
        );

        assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        scheduled.snapshot(),
                        command(PublicationAction.PUBLISH, RoleCode.PUBLISHER, new Version(1), CHECKED_AT)
                )
        );

        PublicationWorkflow.PublicationResult published = workflow.apply(
                scheduled.snapshot(),
                command(PublicationAction.PUBLISH, RoleCode.PUBLISHER, new Version(1), PUBLISH_AT)
        );

        assertEquals(PublicationState.PUBLISHED, published.snapshot().state());
    }

    @Test
    void publishedCanArchiveDirectly() {
        PublicationWorkflow.PublicationSnapshot published = snapshot(
                PublicationState.PUBLISHED,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflow.PublicationResult archived = workflow.apply(
                published,
                command(PublicationAction.ARCHIVE, RoleCode.PUBLISHER, new Version(0), CHECKED_AT)
        );

        assertEquals(PublicationState.ARCHIVED, archived.snapshot().state());
        assertEquals(new Version(1), archived.snapshot().version());
    }

    @Test
    void roleRevisionAndVersionChecksRejectUnsafeCommands() {
        PublicationWorkflow.PublicationSnapshot draft = snapshot(
                PublicationState.DRAFT,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflowException roleError = assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        draft,
                        command(PublicationAction.SUBMIT, RoleCode.PUBLISHER, new Version(0), CHECKED_AT)
                )
        );
        assertEquals("ROLE_REQUIRED", roleError.code());

        PublicationWorkflowException revisionError = assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        draft,
                        new PublicationWorkflow.PublicationCommand(
                                PublicationAction.SUBMIT,
                                RoleCode.EDITOR,
                                new Version(0),
                                UUID.fromString("00000000-0000-4000-8000-000000000499"),
                                CHECKED_AT,
                                null,
                                null
                        )
                )
        );
        assertEquals("REVISION_CONFLICT", revisionError.code());

        VersionConflictException versionError = assertThrows(
                VersionConflictException.class,
                () -> workflow.apply(
                        draft,
                        command(PublicationAction.SUBMIT, RoleCode.EDITOR, new Version(1), CHECKED_AT)
                )
        );
        assertEquals(new Version(1), versionError.expected());
        assertEquals(new Version(0), versionError.current());
    }

    @Test
    void withdrawalRequiresReasonAndLeavesAnAuditableState() {
        PublicationWorkflow.PublicationSnapshot published = snapshot(
                PublicationState.PUBLISHED,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflowException error = assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        published,
                        PublicationWorkflow.PublicationCommand.withReason(
                                PublicationAction.WITHDRAW,
                                RoleCode.PUBLISHER,
                                new Version(0),
                                ARTICLE_REVISION_ID,
                                CHECKED_AT,
                                ""
                        )
                )
        );

        assertEquals("WITHDRAW_REASON_REQUIRED", error.code());
    }

    private static PublicationWorkflow.PublicationCommand command(
            PublicationAction action,
            RoleCode role,
            Version version,
            Instant requestedAt
    ) {
        return PublicationWorkflow.PublicationCommand.of(
                action,
                role,
                version,
                ARTICLE_REVISION_ID,
                requestedAt
        );
    }

    private static PublicationWorkflow.PublicationSnapshot snapshot(
            PublicationState state,
            boolean contentReady,
            PublicationReadinessService.MediaRequirement... requirements
    ) {
        return new PublicationWorkflow.PublicationSnapshot(
                ARTICLE_ID,
                ARTICLE_REVISION_ID,
                state,
                new Version(0),
                contentReady,
                List.of(requirements),
                null
        );
    }

    private static PublicationReadinessService.MediaRequirement rights(
            RightsPolicy.Status status,
            Set<String> channels
    ) {
        return new PublicationReadinessService.MediaRequirement(
                ASSET_ID,
                MediaProcessingState.READY,
                List.of(rightsRecord(status, channels))
        );
    }

    private static RightsPolicy.RightsRecord rightsRecord(
            RightsPolicy.Status status,
            Set<String> channels
    ) {
        return new RightsPolicy.RightsRecord(
                RIGHTS_ID,
                ASSET_ID,
                3,
                status,
                channels,
                CHECKED_AT.minusSeconds(60),
                CHECKED_AT.plusSeconds(7200)
        );
    }
}
