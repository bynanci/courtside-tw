package tw.basketball.magazine.basketball.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Stable identities and append-only facts. All periods are start-inclusive, end-exclusive. */
public final class BasketballDomain {
    private BasketballDomain() {
    }

    public enum Lifecycle { ACTIVE, SUSPENDED, DISSOLVED, REORGANIZED }
    public enum Participation { JOINED, ACTIVE, EXITED, SUSPENDED, DISSOLVED, TRANSFERRED }
    public enum StintStatus { SIGNED, ACTIVE, LOAN, INJURED, RELEASED, TRANSFERRED, UNKNOWN }
    public enum Gender { MEN, WOMEN, MIXED }
    public enum AgeGroup { SENIOR, YOUTH }
    public enum Discipline { FIVE_ON_FIVE, THREE_ON_THREE }
    public enum RosterStatus { TRAINING, FINAL }
    public enum EntryStatus { CALLED_UP, ACTIVE, INJURED, WITHDRAWN, REPLACEMENT }
    public enum CompetitionKind { FIBA, ASIA_CUP, WORLD_CUP_QUALIFIER, OLYMPIC_QUALIFIER, WINDOW, OTHER }

    public record Period(LocalDate startDate, LocalDate endDate) {
        public Period {
            Objects.requireNonNull(startDate, "startDate");
            if (endDate != null && !endDate.isAfter(startDate)) {
                throw new IllegalArgumentException("endDate must be after startDate");
            }
        }

        public boolean contains(LocalDate date) {
            Objects.requireNonNull(date, "date");
            return !date.isBefore(startDate) && (endDate == null || date.isBefore(endDate));
        }

        public boolean contains(Period other) {
            return !other.startDate().isBefore(startDate)
                    && (endDate == null || (other.endDate() != null && !other.endDate().isAfter(endDate)));
        }
    }

    /** The same alias type is used as LeagueAlias, TeamAlias and PlayerAlias by its owner aggregate. */
    public record Alias(UUID id, UUID ownerId, String name, String locale, Period period, List<UUID> evidenceIds,
                        UUID supersedesAliasId) {
        public Alias(UUID id, UUID ownerId, String name, String locale, Period period, List<UUID> evidenceIds) {
            this(id, ownerId, name, locale, period, evidenceIds, null);
        }

        public Alias {
            requiredIds(id, ownerId);
            name = text(name, "name");
            locale = text(locale, "locale");
            Objects.requireNonNull(period, "period");
            evidenceIds = evidence(evidenceIds);
            if (id.equals(supersedesAliasId)) {
                throw new IllegalArgumentException("alias cannot supersede itself");
            }
        }
    }

    public record League(UUID id, Lifecycle lifecycle, List<Alias> aliases, List<UUID> evidenceIds) {
        public League {
            requiredIds(id);
            Objects.requireNonNull(lifecycle, "lifecycle");
            aliases = BasketballDomain.aliases(id, aliases);
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record Team(UUID id, Lifecycle lifecycle, List<Alias> aliases, List<UUID> evidenceIds) {
        public Team {
            requiredIds(id);
            Objects.requireNonNull(lifecycle, "lifecycle");
            aliases = BasketballDomain.aliases(id, aliases);
            evidenceIds = evidence(evidenceIds);
        }
    }

    /** Deliberately has no teamId: career belongs to the stint history. */
    public record Player(UUID id, List<Alias> aliases, List<UUID> evidenceIds) {
        public Player {
            requiredIds(id);
            aliases = BasketballDomain.aliases(id, aliases);
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record Season(UUID id, UUID leagueId, String officialLabel, Period period, List<UUID> evidenceIds) {
        public Season {
            requiredIds(id, leagueId);
            officialLabel = text(officialLabel, "officialLabel");
            Objects.requireNonNull(period, "period");
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record TeamSeason(UUID id, UUID teamId, UUID leagueId, UUID seasonId,
                             Participation status, Period period, List<UUID> evidenceIds) {
        public TeamSeason {
            requiredIds(id, teamId, leagueId, seasonId);
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(period, "period");
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record PlayerTeamStint(UUID id, UUID playerId, UUID teamId, UUID leagueId, UUID seasonId,
                                  Period period, StintStatus status, String countryCode, String system,
                                  String role, BigDecimal minutesPerGame, String tacticalPosition,
                                  List<UUID> evidenceIds) {
        public PlayerTeamStint {
            requiredIds(id, playerId, teamId, leagueId, seasonId);
            Objects.requireNonNull(period, "period");
            Objects.requireNonNull(status, "status");
            countryCode = text(countryCode, "countryCode");
            if (!countryCode.matches("[A-Z]{2}")) {
                throw new IllegalArgumentException("countryCode must be an ISO alpha-2 code");
            }
            system = text(system, "system");
            if (minutesPerGame != null && minutesPerGame.signum() < 0) {
                throw new IllegalArgumentException("minutesPerGame cannot be negative");
            }
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record Competition(UUID id, String name, CompetitionKind kind, List<UUID> evidenceIds) {
        public Competition {
            requiredIds(id);
            name = text(name, "name");
            Objects.requireNonNull(kind, "kind");
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record Tournament(UUID id, UUID competitionId, String officialName, Period period,
                             List<Alias> aliases, List<UUID> evidenceIds) {
        public Tournament {
            requiredIds(id, competitionId);
            officialName = text(officialName, "officialName");
            Objects.requireNonNull(period, "period");
            aliases = BasketballDomain.aliases(id, aliases);
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record Game(UUID id, UUID tournamentId, UUID homeTeamId, UUID awayTeamId,
                       java.time.Instant startsAt, String venue, List<UUID> evidenceIds) {
        public Game {
            requiredIds(id, tournamentId, homeTeamId, awayTeamId);
            if (homeTeamId.equals(awayTeamId)) {
                throw new IllegalArgumentException("game opponents must differ");
            }
            Objects.requireNonNull(startsAt, "startsAt");
            venue = text(venue, "venue");
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record NationalTeamCampaign(UUID id, UUID competitionId, Gender gender, AgeGroup ageGroup,
                                       Discipline discipline, Period period, String objective,
                                       List<UUID> evidenceIds) {
        public NationalTeamCampaign {
            requiredIds(id, competitionId);
            Objects.requireNonNull(gender, "gender");
            Objects.requireNonNull(ageGroup, "ageGroup");
            Objects.requireNonNull(discipline, "discipline");
            Objects.requireNonNull(period, "period");
            objective = text(objective, "objective");
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record RosterEntry(UUID playerId, EntryStatus status, String role, Period period,
                              UUID replacesPlayerId, List<UUID> evidenceIds) {
        public RosterEntry {
            requiredIds(playerId);
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(period, "period");
            if ((status == EntryStatus.REPLACEMENT) != (replacesPlayerId != null)) {
                throw new IllegalArgumentException("only replacement entries require replacesPlayerId");
            }
            if (playerId.equals(replacesPlayerId)) {
                throw new IllegalArgumentException("a player cannot replace themself");
            }
            evidenceIds = evidence(evidenceIds);
        }
    }

    public record NationalTeamRoster(UUID id, UUID campaignId, int revision, UUID supersedesRosterId,
                                     RosterStatus status, LocalDate effectiveAt, List<RosterEntry> entries,
                                     List<UUID> evidenceIds) {
        public NationalTeamRoster {
            requiredIds(id, campaignId);
            if (revision < 1 || ((revision == 1) != (supersedesRosterId == null))) {
                throw new IllegalArgumentException("roster revision must start at 1 and link its predecessor");
            }
            Objects.requireNonNull(status, "status");
            Objects.requireNonNull(effectiveAt, "effectiveAt");
            entries = List.copyOf(entries);
            if (entries.isEmpty() || entries.stream().map(RosterEntry::playerId).distinct().count() != entries.size()) {
                throw new IllegalArgumentException("roster must contain distinct stable player IDs");
            }
            evidenceIds = evidence(evidenceIds);
        }
    }

    public static List<Alias> aliasesAt(List<Alias> aliases, LocalDate at, String locale) {
        return aliases.stream().filter(alias -> alias.locale().equals(locale) && alias.period().contains(at))
                .filter(alias -> aliases.stream().noneMatch(next -> alias.id().equals(next.supersedesAliasId())
                        && !at.isBefore(next.period().startDate())))
                .toList();
    }

    private static List<Alias> aliases(UUID ownerId, List<Alias> aliases) {
        List<Alias> result = List.copyOf(aliases);
        if (result.isEmpty() || result.stream().anyMatch(alias -> !alias.ownerId().equals(ownerId))
                || result.stream().map(Alias::id).distinct().count() != result.size()) {
            throw new IllegalArgumentException("aliases must be nonempty, unique and owned by this identity");
        }
        return result;
    }

    private static List<UUID> evidence(List<UUID> values) {
        List<UUID> result = List.copyOf(values);
        if (result.isEmpty() || new HashSet<>(result).size() != result.size()) {
            throw new IllegalArgumentException("facts require distinct evidence references");
        }
        return result;
    }

    private static String text(String value, String name) {
        if (value == null || value.isBlank() || value.length() > 500) {
            throw new IllegalArgumentException(name + " must contain 1..500 characters");
        }
        return value;
    }

    private static void requiredIds(UUID... ids) {
        for (UUID id : ids) {
            Objects.requireNonNull(id, "stable ID");
        }
    }
}
