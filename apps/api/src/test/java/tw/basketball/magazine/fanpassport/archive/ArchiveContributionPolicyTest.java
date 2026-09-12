package tw.basketball.magazine.fanpassport.archive;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

final class ArchiveContributionPolicyTest {
    private static final Instant NOW = Instant.parse("2026-08-01T00:00:00Z");
    private static final ActorContext PUBLISHER = ActorContext.user("reviewer", Set.of(RoleCode.PUBLISHER), RequestId.of("recap-review"));

    @Test
    void aReaderCannotApproveAndAnotherReaderCannotWithdrawPrivateContribution() {
        var reader = ActorContext.user("reader", Set.of(RoleCode.READER), RequestId.of("recap-reader"));
        var draft = contribution("DRAFT", true);
        assertThrows(IllegalArgumentException.class, () ->
                draft.transition("ACCEPTED", id(2), reader, "RIGHTS_REVIEWED", NOW));
        assertThrows(IllegalArgumentException.class, () ->
                draft.transition("WITHDRAWN", id(999), reader, "CONSENT_WITHDRAWN", NOW));
        assertEquals("WITHDRAWN", draft.transition("WITHDRAWN", id(2), reader, "CONSENT_WITHDRAWN", NOW).status());
    }

    @Test
    void consentAndCurrentChannelRightsAreNecessaryForPublicProjection() {
        var draft = contribution("DRAFT", true);
        assertTrue(draft.publicProjection("PUBLIC_WEB", NOW).isEmpty());
        var accepted = draft.transition("ACCEPTED", id(4), PUBLISHER, "RIGHTS_REVIEWED", NOW);
        var payload = accepted.publicProjection("PUBLIC_WEB", NOW).orElseThrow();
        assertEquals("Fixture credit", payload.get("credit"));
        assertFalse(payload.containsKey("contributorAccountId"));
        assertFalse(payload.containsKey("consent"));
        assertFalse(payload.containsKey("audit"));
        assertTrue(accepted.publicProjection("IPFS", NOW).isEmpty());
        assertTrue(contribution("DRAFT", false).publicProjection("PUBLIC_WEB", NOW).isEmpty());
        assertThrows(IllegalArgumentException.class, () ->
                contribution("DRAFT", false).transition("ACCEPTED", id(4), PUBLISHER, "RIGHTS_REVIEWED", NOW));
    }

    @Test
    void withdrawalIsAppendOnlyAndCannotBeReacceptedOrPresentedFromCache() {
        var accepted = contribution("DRAFT", true).transition("ACCEPTED", id(4), PUBLISHER, "RIGHTS_REVIEWED", NOW);
        var withdrawn = accepted.transition("WITHDRAWN", id(4), PUBLISHER, "CONSENT_WITHDRAWN", NOW.plusSeconds(1));
        assertEquals("ACCEPTED", accepted.status());
        assertEquals(2, withdrawn.history().size());
        assertEquals("WITHDRAWN", withdrawn.status());
        for (String channel : List.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE", "IPFS")) {
            assertTrue(withdrawn.publicProjection(channel, NOW.plusSeconds(1)).isEmpty());
        }
        assertThrows(IllegalArgumentException.class, () ->
                withdrawn.transition("ACCEPTED", id(4), PUBLISHER, "RIGHTS_REVIEWED", NOW.plusSeconds(2)));
    }

    @Test
    void copiedRecordsAreImmutableAndExpiryOrWrongAssetFailsClosed() {
        var accepted = contribution("DRAFT", true).transition("ACCEPTED", id(4), PUBLISHER, "RIGHTS_REVIEWED", NOW);
        assertTrue(accepted.publicProjection("PUBLIC_WEB", NOW.plusSeconds(3600)).isEmpty());
        assertThrows(UnsupportedOperationException.class, () -> accepted.history().clear());
        assertThrows(IllegalArgumentException.class, () -> new ArchiveContributionPolicy.Contribution(
                id(1), id(2), "HISTORICAL_PHOTO", id(999), "DRAFT", true, NOW,
                accepted.rights(), List.of()));
    }

    private static ArchiveContributionPolicy.Contribution contribution(String status, boolean consent) {
        return new ArchiveContributionPolicy.Contribution(id(1), id(2), "HISTORICAL_PHOTO", id(3), status,
                consent, NOW, new ArchiveContributionPolicy.Rights(id(3), "Fixture owner", "Fixture license",
                Set.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE"), false, false,
                NOW.minusSeconds(1), NOW.plusSeconds(3600), "Fixture credit", "ORIGIN_WITHDRAWAL", null), List.of());
    }

    private static UUID id(int value) {
        return UUID.fromString("00000000-0000-4000-8000-" + String.format("%012d", value));
    }
}
