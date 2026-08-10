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
    }

    @Test
    void expiredRecordBlocksBeforeItCanBeUsed() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(new RightsPolicy.RightsRecord(
                        ASSET_ID,
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
    }

    @Test
    void revokedRecordWinsOverOtherRecords() {
        RightsPolicy.RightsDecision decision = RightsPolicy.evaluate(
                ASSET_ID,
                List.of(
                        record(RightsPolicy.Status.VALID, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL)),
                        record(RightsPolicy.Status.REVOKED, Set.of(RightsPolicy.PUBLIC_WEB_CHANNEL))
                ),
                RightsPolicy.PUBLIC_WEB_CHANNEL,
                CHECKED_AT
        );

        assertFalse(decision.allowed());
        assertEquals("RIGHTS_REVOKED", decision.blockingCode());
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
    }

    private static RightsPolicy.RightsRecord record(RightsPolicy.Status status, Set<String> channels) {
        return new RightsPolicy.RightsRecord(ASSET_ID, status, channels, VALID_FROM, VALID_UNTIL);
    }
}
