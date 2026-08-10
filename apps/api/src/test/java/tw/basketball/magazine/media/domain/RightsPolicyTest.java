package tw.basketball.magazine.media.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

final class RightsPolicyTest {
    private static final UUID ASSET_ID = UUID.fromString("00000000-0000-4000-8000-000000000301");
    private static final UUID RIGHTS_ID = UUID.fromString("00000000-0000-4000-8000-000000000302");
    private static final Instant CHECKED_AT = Instant.parse("2026-08-09T00:00:00Z");
    private static final Instant VALID_FROM = CHECKED_AT.minusSeconds(60);
    private static final Instant VALID_UNTIL = CHECKED_AT.plusSeconds(60);

    @Test
    void validPublicWebRecordAllowsPublication() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(record(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))),
                RightsPolicy.PUBLIC_WEB_CHANNEL,
                CHECKED_AT
        );

        assertTrue(decision.allowed());
        assertNull(decision.blockingCode());
        assertEquals(RIGHTS_ID, decision.rightsRecordId());
        assertEquals(3L, decision.rightsRecordVersion());
    }

    @Test
    void missingRecordBlocksWithStableCode() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(),
                RightsPolicy.PUBLIC_WEB_CHANNEL,
                CHECKED_AT
        );

        assertFalse(decision.allowed());
        assertEquals("RIGHTS_MISSING", decision.blockingCode());
        assertNull(decision.rightsRecordId());
        assertNull(decision.rightsRecordVersion());
    }

    @Test
    void expiredRecordBlocksBeforeItCanBeUsed() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(new RightsPolicy.RightsRecord(
                        RIGHTS_ID,
                        ASSET_ID,
                        3,
                        RightsPolicy.Status.VALID,
                        Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL),
                        CHECKED_AT.minusSeconds(120),
                        CHECKED_AT.minusSeconds(1)
                )),
                RightsPolicy.PUBLIC_WEB_CHANNEL,
                CHECKED_AT
        );

        assertFalse(decision.allowed());
        assertEquals("RIGHTS_EXPIRED", decision.blockingCode());
        assertEquals(RIGHTS_ID, decision.rightsRecordId());
    }

    @Test
    void revokedRecordWinsOverOtherRecords() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(
                        record(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL)),
                        new RightsPolicy.RightsRecord(
                                RIGHTS_ID,
                                ASSET_ID,
                                4,
                                RightsPolicy.Status.REVOKED,
                                Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL),
                                VALID_FROM,
                                VALID_UNTIL
                        )
                ),
                RightsPolicy.PUBLIC_WEB_CHANNEL,
                CHECKED_AT
        );

        assertFalse(decision.allowed());
        assertEquals("RIGHTS_REVOKED", decision.blockingCode());
        assertEquals(RIGHTS_ID, decision.rightsRecordId());
        assertEquals(4L, decision.rightsRecordVersion());
    }

    @Test
    void activeRecordForAnotherChannelBlocksWithWrongChannel() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(record(RightsPolicy.Status.VALID, Set.of("OFFLINE"))),
                RightsPolicy.PUBLIC_WEB_CHANNEL,
                CHECKED_AT
        );

        assertFalse(decision.allowed());
        assertEquals("RIGHTS_WRONG_CHANNEL", decision.blockingCode());
        assertEquals(RIGHTS_ID, decision.rightsRecordId());
    }

    private static RightsPolicy.RightsRecord record(RightsPolicy.Status status, Set<String> channels) {
        return new RightsPolicy.RightsRecord(
                RIGHTS_ID,
                ASSET_ID,
                3,
                status,
                channels,
                VALID_FROM,
                VALID_UNTIL
        );
    }
}
