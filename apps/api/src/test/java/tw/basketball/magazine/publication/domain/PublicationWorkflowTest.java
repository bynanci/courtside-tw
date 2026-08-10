package tw.basketball.magazine.publication.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.media.domain.RightsPolicy;
import tw.basketball.magazine.publication.application.PublicationReadinessService;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

final class PublicationWorkflowTest {
    private static final UUID ARTICLE_ID = UUID.fromString("00000000-0000-4000-8000-000000000401");
    private static final UUID ASSET_ID = UUID.fromString("00000000-0000-4000-8000-000000000402");
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
                PublicationWorkflow.PublicationCommand.of(
                        PublicationAction.SUBMIT,
                        RoleCode.EDITOR,
                        new Version(0),
                        CHECKED_AT
                )
        );
        PublicationWorkflow.PublicationResult approved = workflow.apply(
                submitted.snapshot(),
                PublicationWorkflow.PublicationCommand.of(
                        PublicationAction.APPROVE,
                        RoleCode.PUBLISHER,
                        new Version(1),
                        CHECKED_AT
                )
        );

        assertEquals(PublicationState.IN_REVIEW, submitted.snapshot().state());
        assertEquals(PublicationState.APPROVED, approved.snapshot().state());
        assertEquals(new Version(2), approved.snapshot().version());
    }

    @Test
    void missingRightsBlocksSubmitWithoutAdvancingVersion() {
        PublicationWorkflow.PublicationSnapshot draft = snapshot(
                PublicationState.DRAFT,
                true,
                new PublicationReadinessService.MediaRequirement(ASSET_ID, List.of())
        );

        PublicationWorkflow.PublicationResult result = workflow.apply(
                draft,
                PublicationWorkflow.PublicationCommand.of(
                        PublicationAction.SUBMIT,
                        RoleCode.EDITOR,
                        new Version(0),
                        CHECKED_AT
                )
        );

        assertEquals(PublicationWorkflow.PublicationResult.Status.BLOCKED, result.status());
        assertEquals(List.of("RIGHTS_MISSING"), result.blockingCodes());
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
                new PublicationWorkflow.PublicationCommand(
                        PublicationAction.SCHEDULE,
                        RoleCode.PUBLISHER,
                        new Version(0),
                        CHECKED_AT,
                        PUBLISH_AT,
                        null
                )
        );

        assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        scheduled.snapshot(),
                        PublicationWorkflow.PublicationCommand.of(
                                PublicationAction.PUBLISH,
                                RoleCode.PUBLISHER,
                                new Version(1),
                                CHECKED_AT
                        )
                )
        );

        PublicationWorkflow.PublicationResult published = workflow.apply(
                scheduled.snapshot(),
                PublicationWorkflow.PublicationCommand.of(
                        PublicationAction.PUBLISH,
                        RoleCode.PUBLISHER,
                        new Version(1),
                        PUBLISH_AT
                )
        );

        assertEquals(PublicationState.PUBLISHED, published.snapshot().state());
    }

    @Test
    void roleAndVersionChecksRejectUnsafeCommands() {
        PublicationWorkflow.PublicationSnapshot draft = snapshot(
                PublicationState.DRAFT,
                true,
                rights(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
        );

        PublicationWorkflowException roleError = assertThrows(
                PublicationWorkflowException.class,
                () -> workflow.apply(
                        draft,
                        PublicationWorkflow.PublicationCommand.of(
                                PublicationAction.SUBMIT,
                                RoleCode.PUBLISHER,
                                new Version(0),
                                CHECKED_AT
                        )
                )
        );
        assertEquals("ROLE_REQUIRED", roleError.code());

        VersionConflictException versionError = assertThrows(
                VersionConflictException.class,
                () -> workflow.apply(
                        draft,
                        PublicationWorkflow.PublicationCommand.of(
                                PublicationAction.SUBMIT,
                                RoleCode.EDITOR,
                                new Version(1),
                                CHECKED_AT
                        )
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
                        new PublicationWorkflow.PublicationCommand(
                                PublicationAction.WITHDRAW,
                                RoleCode.PUBLISHER,
                                new Version(0),
                                CHECKED_AT,
                                null,
                                ""
                        )
                )
        );

        assertEquals("WITHDRAW_REASON_REQUIRED", error.code());
    }

    private static PublicationWorkflow.PublicationSnapshot snapshot(
            PublicationState state,
            boolean contentReady,
            PublicationReadinessService.MediaRequirement... requirements
    ) {
        return new PublicationWorkflow.PublicationSnapshot(
                ARTICLE_ID,
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
                List.of(new RightsPolicy.RightsRecord(
                        ASSET_ID,
                        status,
                        channels,
                        CHECKED_AT.minusSeconds(60),
                        CHECKED_AT.plusSeconds(7200)
                ))
        );
    }
}
