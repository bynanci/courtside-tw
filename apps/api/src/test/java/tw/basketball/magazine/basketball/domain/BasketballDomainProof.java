package tw.basketball.magazine.basketball.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import tw.basketball.magazine.basketball.application.BasketballCatalog;

/** Synthetic fixtures exercise identity, temporal joins, overseas career and immutable roster revisions. */
public final class BasketballDomainProof {
    private static final List<UUID> EVIDENCE = List.of(id(900));
    private static final BasketballDomain.Period YEAR = period("2026-01-01", "2027-01-01");

    private BasketballDomainProof() {
    }

    public static void main(String[] args) {
        BasketballCatalog catalog = new BasketballCatalog(evidenceId -> {
            check(EVIDENCE.contains(evidenceId), "unknown evidence rejected");
        });
        BasketballDomain.Alias old = alias(101, 1, "Synthetic former league", period("2026-01-01", "2026-07-01"));
        BasketballDomain.Alias renamed = alias(102, 1, "Synthetic renamed league", period("2026-07-01", "2027-01-01"));
        catalog.add(new BasketballDomain.League(id(1), BasketballDomain.Lifecycle.ACTIVE, List.of(old, renamed), EVIDENCE));
        catalog.add(new BasketballDomain.League(id(2), BasketballDomain.Lifecycle.ACTIVE,
                List.of(alias(103, 2, "Synthetic overseas league", YEAR)), EVIDENCE));
        check(BasketballDomain.aliasesAt(List.of(old, renamed), LocalDate.parse("2026-06-30"), "zh-TW")
                .equals(List.of(old)), "historical article keeps former label");
        check(BasketballDomain.aliasesAt(List.of(old, renamed), LocalDate.parse("2026-07-01"), "zh-TW")
                .equals(List.of(renamed)), "alias boundary is half-open");
        rejected(() -> period("2026-01-01", "2026-01-01"), "empty valid period");
        for (int team : List.of(3, 4)) {
            catalog.add(new BasketballDomain.Team(id(team), BasketballDomain.Lifecycle.ACTIVE,
                    List.of(alias(110 + team, team, "Synthetic team " + team, YEAR)), EVIDENCE));
        }
        for (int player : List.of(5, 6)) {
            catalog.add(new BasketballDomain.Player(id(player),
                    List.of(alias(120 + player, player, "Synthetic same name", YEAR)), EVIDENCE));
        }
        check(!catalog.player(id(5)).orElseThrow().id().equals(catalog.player(id(6)).orElseThrow().id()),
                "same name players keep separate stable IDs");
        BasketballDomain.Alias originalPlayerName = catalog.aliases(id(5)).get(0);
        BasketballDomain.Alias changedPlayerName = new BasketballDomain.Alias(id(200), id(5), "Synthetic revised name", "zh-TW",
                period("2026-07-01", "2027-01-01"), EVIDENCE, originalPlayerName.id());
        catalog.add(changedPlayerName);
        check(BasketballDomain.aliasesAt(catalog.aliases(id(5)), LocalDate.parse("2026-06-01"), "zh-TW").equals(List.of(originalPlayerName)),
                "appended rename does not rewrite the earlier article label");
        check(BasketballDomain.aliasesAt(catalog.aliases(id(5)), LocalDate.parse("2026-08-01"), "zh-TW").equals(List.of(changedPlayerName)),
                "appended rename supersedes an initially open alias period");
        catalog.add(new BasketballDomain.Season(id(7), id(1), "Synthetic season", YEAR, EVIDENCE));
        catalog.add(new BasketballDomain.Season(id(8), id(2), "Synthetic overseas season", YEAR, EVIDENCE));
        catalog.add(new BasketballDomain.TeamSeason(id(20), id(3), id(1), id(7), BasketballDomain.Participation.ACTIVE, YEAR, EVIDENCE));
        catalog.add(new BasketballDomain.TeamSeason(id(21), id(4), id(2), id(8), BasketballDomain.Participation.ACTIVE, YEAR, EVIDENCE));
        BasketballDomain.PlayerTeamStint overseas = stint(31, 4, 2, 8, "JP", period("2026-05-01", "2027-01-01"));
        BasketballDomain.PlayerTeamStint domestic = stint(30, 3, 1, 7, "TW", period("2026-01-01", "2026-05-01"));
        catalog.add(overseas);
        catalog.add(domestic);
        check(catalog.career(id(5)).equals(List.of(domestic, overseas)), "career ordered by effective date, not ingest order");
        check(catalog.career(id(6)).isEmpty(), "same-name player's career is not merged");
        rejected(() -> catalog.add(stint(32, 3, 2, 8, "US", YEAR)), "cross-league must bind participation");
        rejected(() -> new BasketballDomain.Player(id(9), List.of(alias(129, 9, "Synthetic missing evidence", YEAR)), List.of()),
                "canonical facts require evidence");
        catalog.add(new BasketballDomain.Competition(id(40), "Synthetic qualification", BasketballDomain.CompetitionKind.FIBA, EVIDENCE));
        catalog.add(new BasketballDomain.NationalTeamCampaign(id(41), id(40), BasketballDomain.Gender.WOMEN,
                BasketballDomain.AgeGroup.YOUTH, BasketballDomain.Discipline.THREE_ON_THREE, YEAR, "Synthetic target", EVIDENCE));
        BasketballDomain.RosterEntry first = new BasketballDomain.RosterEntry(id(5), BasketballDomain.EntryStatus.CALLED_UP,
                null, YEAR, null, EVIDENCE);
        BasketballDomain.NationalTeamRoster roster1 = new BasketballDomain.NationalTeamRoster(id(50), id(41), 1,
                null, BasketballDomain.RosterStatus.TRAINING, LocalDate.parse("2026-01-01"), List.of(first), EVIDENCE);
        catalog.add(roster1);
        BasketballDomain.RosterEntry withdrawn = new BasketballDomain.RosterEntry(id(5), BasketballDomain.EntryStatus.WITHDRAWN,
                null, YEAR, null, EVIDENCE);
        BasketballDomain.RosterEntry replacement = new BasketballDomain.RosterEntry(id(6), BasketballDomain.EntryStatus.REPLACEMENT,
                null, YEAR, id(5), EVIDENCE);
        BasketballDomain.NationalTeamRoster roster2 = new BasketballDomain.NationalTeamRoster(id(51), id(41), 2,
                id(50), BasketballDomain.RosterStatus.FINAL, LocalDate.parse("2026-02-01"), List.of(withdrawn, replacement), EVIDENCE);
        catalog.add(roster2);
        catalog.add(roster2);
        check(catalog.rosters(id(41)).equals(List.of(roster1, roster2)), "roster replacement preserves earlier revision");
        rejected(() -> catalog.add(new BasketballDomain.NationalTeamRoster(id(52), id(41), 4, id(51),
                BasketballDomain.RosterStatus.FINAL, LocalDate.parse("2026-03-01"), List.of(replacement), EVIDENCE)), "no missing roster revision");
        rejected(() -> new BasketballDomain.NationalTeamRoster(id(53), id(41), 1, null,
                BasketballDomain.RosterStatus.FINAL, LocalDate.parse("2026-03-01"), List.of(first, first), EVIDENCE), "duplicate player in roster");
        System.out.println("PASS basketball identity/alias-supersession/period/relationship/career/roster invariants");
    }

    private static BasketballDomain.PlayerTeamStint stint(int id, int team, int league, int season, String country,
                                                         BasketballDomain.Period period) {
        return new BasketballDomain.PlayerTeamStint(id(id), id(5), id(team), id(league), id(season), period,
                BasketballDomain.StintStatus.ACTIVE, country, "SYNTHETIC_PRO", null, null, null, EVIDENCE);
    }

    private static BasketballDomain.Alias alias(int id, int owner, String name, BasketballDomain.Period period) {
        return new BasketballDomain.Alias(id(id), id(owner), name, "zh-TW", period, EVIDENCE);
    }

    private static BasketballDomain.Period period(String start, String end) {
        return new BasketballDomain.Period(LocalDate.parse(start), LocalDate.parse(end));
    }

    private static UUID id(int number) {
        return UUID.fromString(String.format("00000000-0000-4000-8000-%012d", number));
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void rejected(Runnable action, String message) {
        try {
            action.run();
            throw new AssertionError("must reject " + message);
        } catch (IllegalArgumentException expected) {
            // Validation must fail before an immutable record enters history.
        }
    }
}
