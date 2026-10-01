package tw.basketball.magazine.fanpassport.archive;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/** Shared JUnit/standalone regression proof for acceptance time and rehydrated lifecycle invariants. */
public final class ArchiveLifecycleProof {
    private static final Instant NOW = Instant.parse("2026-08-01T00:00:00Z");
    private static final UUID OWNER = id(1);
    private static final UUID ASSET = id(2);

    private ArchiveLifecycleProof() {
    }

    public static void main(String[] args) {
        if (args.length == 0 || "future".equals(args[0])) {
            futureAcceptanceRemainsPrivateUntilEffective();
        }
        if (args.length == 0 || "history".equals(args[0])) {
            rehydratedHistoryPreservesTerminalWithdrawalAndOrdering();
        }
        System.out.println("PASS archive acceptance-time and complete lifecycle validation");
    }

    public static void futureAcceptanceRemainsPrivateUntilEffective() {
        var draft = contribution("DRAFT", true, List.of(), rights());
        var actor = ActorContext.user("fixture-publisher", Set.of(RoleCode.PUBLISHER), RequestId.of("archive-lifecycle"));
        var accepted = draft.transition("ACCEPTED", OWNER, actor, "RIGHTS_REVIEWED", NOW.plusSeconds(3600));
        for (String channel : List.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE")) {
            if (accepted.publicProjection(channel, NOW.plusSeconds(3599)).isPresent()) {
                throw new AssertionError("future acceptance cannot authorize current " + channel + " presentation");
            }
            if (accepted.publicProjection(channel, NOW.plusSeconds(3600)).isEmpty()) {
                throw new AssertionError("acceptance becomes effective exactly at its timestamp");
            }
        }
    }

    public static void rehydratedHistoryPreservesTerminalWithdrawalAndOrdering() {
        rejected(() -> contribution("ACCEPTED", true, List.of(event("WITHDRAWN", 1), event("ACCEPTED", 2)), rights()),
                "withdrawn history cannot be reaccepted by reconstruction");
        rejected(() -> contribution("ACCEPTED", true, List.of(event("SUBMITTED", 2), event("ACCEPTED", 1)), rights()),
                "event time cannot move backward");
        rejected(() -> contribution("SUBMITTED", true, List.of(), rights()), "submitted record needs a receipt");
        rejected(() -> contribution("SUBMITTED", false, List.of(event("SUBMITTED", 1)), rights()), "submission requires consent");
        rejected(() -> contribution("SUBMITTED", true, List.of(event("ACCEPTED", 1), event("SUBMITTED", 2)), rights()),
                "accepted record cannot return to submitted");
        rejected(() -> contribution("ACCEPTED", true, List.of(event("ACCEPTED", -1)), rights()), "acceptance cannot predate consent");
        rejected(() -> contribution("ACCEPTED", true, List.of(event("ACCEPTED", 1), event("ACCEPTED", 2)), rights()),
                "duplicate acceptance must not create a second transition");
        rejected(() -> contribution("WITHDRAWN", false, List.of(event("WITHDRAWN", 1)), rights()),
                "withdrawn history must carry rights withdrawal evidence");
        var withdrawn = contribution("WITHDRAWN", false,
                List.of(event("SUBMITTED", 0), event("ACCEPTED", 1), event("WITHDRAWN", 2)), rights().withdraw(NOW.plusSeconds(2)));
        if (withdrawn.publicProjection("PUBLIC_WEB", NOW.plusSeconds(3)).isPresent()) {
            throw new AssertionError("valid withdrawn history remains private");
        }
    }

    private static ArchiveContributionPolicy.Contribution contribution(String status, boolean consent,
            List<ArchiveContributionPolicy.StatusEvent> history, ArchiveContributionPolicy.Rights rights) {
        return new ArchiveContributionPolicy.Contribution(id(3), OWNER, "HISTORICAL_PHOTO", ASSET,
                status, consent, NOW, rights, history);
    }

    private static ArchiveContributionPolicy.StatusEvent event(String status, long offset) {
        return new ArchiveContributionPolicy.StatusEvent(status, OWNER, "FIXTURE_REVIEWED", NOW.plusSeconds(offset));
    }

    private static ArchiveContributionPolicy.Rights rights() {
        return new ArchiveContributionPolicy.Rights(ASSET, "Synthetic owner", "Synthetic license",
                Set.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE"), false, false, NOW.minusSeconds(1), NOW.plusSeconds(7200),
                "Synthetic credit", "ORIGIN_WITHDRAWAL", null);
    }

    private static UUID id(int value) {
        return UUID.fromString(String.format("00000000-0000-4000-8000-%012d", value));
    }

    private static void rejected(Runnable action, String message) {
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Invalid lifecycle evidence must never construct a presentable contribution.
        }
    }
}
