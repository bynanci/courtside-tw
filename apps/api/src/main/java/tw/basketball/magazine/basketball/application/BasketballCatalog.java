package tw.basketball.magazine.basketball.application;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import tw.basketball.magazine.basketball.domain.BasketballDomain;
import tw.basketball.magazine.basketball.domain.TemporalHistory;
import tw.basketball.magazine.basketball.ports.BasketballProjection;
import tw.basketball.magazine.basketball.ports.EvidenceLookup;

/** Canonical aggregate boundary: identity lookup never uses names; relationships and rosters only append. */
public final class BasketballCatalog implements BasketballProjection {
    private final EvidenceLookup evidence;
    private final TemporalHistory<BasketballDomain.League> leagues = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.Team> teams = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.Player> players = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.Season> seasons = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.TeamSeason> participations = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.PlayerTeamStint> stints = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.Competition> competitions = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.Tournament> tournaments = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.Game> games = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.NationalTeamCampaign> campaigns = new TemporalHistory<>();
    private final TemporalHistory<BasketballDomain.NationalTeamRoster> rosters = new TemporalHistory<>();

    public BasketballCatalog(EvidenceLookup evidence) {
        this.evidence = Objects.requireNonNull(evidence, "evidence");
    }

    public synchronized void add(BasketballDomain.League value) {
        validate(value.evidenceIds());
        value.aliases().forEach(alias -> validate(alias.evidenceIds()));
        leagues.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.Team value) {
        validate(value.evidenceIds());
        value.aliases().forEach(alias -> validate(alias.evidenceIds()));
        teams.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.Player value) {
        validate(value.evidenceIds());
        value.aliases().forEach(alias -> validate(alias.evidenceIds()));
        players.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.Season value) {
        require(leagues.values().stream().anyMatch(league -> league.id().equals(value.leagueId())), "unknown league");
        validate(value.evidenceIds());
        seasons.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.TeamSeason value) {
        requireTeam(value.teamId());
        BasketballDomain.Season season = season(value.seasonId(), value.leagueId());
        require(season.period().contains(value.period()), "participation outside season");
        validate(value.evidenceIds());
        participations.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.PlayerTeamStint value) {
        require(player(value.playerId()).isPresent(), "unknown player");
        requireTeam(value.teamId());
        BasketballDomain.Season season = season(value.seasonId(), value.leagueId());
        require(season.period().contains(value.period()), "stint outside season");
        require(participations.values().stream().anyMatch(row -> row.teamId().equals(value.teamId())
                && row.leagueId().equals(value.leagueId()) && row.seasonId().equals(value.seasonId())
                && row.period().contains(value.period())
                && (row.status() == BasketballDomain.Participation.ACTIVE || row.status() == BasketballDomain.Participation.JOINED)),
                "stint must bind the team's evidenced league/season participation");
        validate(value.evidenceIds());
        stints.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.Competition value) {
        validate(value.evidenceIds());
        competitions.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.Tournament value) {
        requireCompetition(value.competitionId());
        validate(value.evidenceIds());
        value.aliases().forEach(alias -> validate(alias.evidenceIds()));
        tournaments.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.Game value) {
        require(tournaments.values().stream().anyMatch(row -> row.id().equals(value.tournamentId())), "unknown tournament");
        requireTeam(value.homeTeamId());
        requireTeam(value.awayTeamId());
        validate(value.evidenceIds());
        games.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.NationalTeamCampaign value) {
        requireCompetition(value.competitionId());
        validate(value.evidenceIds());
        campaigns.append(value.id(), value);
    }

    public synchronized void add(BasketballDomain.NationalTeamRoster value) {
        BasketballDomain.NationalTeamCampaign campaign = campaigns.values().stream()
                .filter(row -> row.id().equals(value.campaignId())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("unknown campaign"));
        List<BasketballDomain.NationalTeamRoster> previous = rosters(value.campaignId());
        Optional<BasketballDomain.NationalTeamRoster> retry = previous.stream().filter(row -> row.id().equals(value.id())).findFirst();
        if (retry.isPresent()) {
            rosters.append(value.id(), value);
            return;
        }
        require(value.revision() == previous.size() + 1, "roster revision must append without gaps");
        if (!previous.isEmpty()) {
            BasketballDomain.NationalTeamRoster prior = previous.get(previous.size() - 1);
            require(prior.id().equals(value.supersedesRosterId()), "roster must supersede the latest revision");
            require(!value.effectiveAt().isBefore(prior.effectiveAt()), "roster effective date cannot move backward");
        }
        require(campaign.period().contains(value.effectiveAt()), "roster outside campaign");
        validate(value.evidenceIds());
        for (BasketballDomain.RosterEntry entry : value.entries()) {
            require(player(entry.playerId()).isPresent(), "unknown roster player");
            require(campaign.period().contains(entry.period()), "roster entry outside campaign");
            if (entry.replacesPlayerId() != null) {
                require(player(entry.replacesPlayerId()).isPresent(), "unknown replaced player");
                require(previous.stream().flatMap(row -> row.entries().stream())
                        .anyMatch(row -> row.playerId().equals(entry.replacesPlayerId())), "replacement must reference a previous roster player");
            }
            validate(entry.evidenceIds());
        }
        rosters.append(value.id(), value);
    }

    @Override
    public Optional<BasketballDomain.Player> player(UUID playerId) {
        return players.values().stream().filter(row -> row.id().equals(playerId)).findFirst();
    }

    @Override
    public List<BasketballDomain.PlayerTeamStint> career(UUID playerId) {
        return stints.values().stream().filter(row -> row.playerId().equals(playerId))
                .sorted(Comparator.comparing((BasketballDomain.PlayerTeamStint row) -> row.period().startDate())
                        .thenComparing(BasketballDomain.PlayerTeamStint::id)).toList();
    }

    @Override
    public List<BasketballDomain.NationalTeamRoster> rosters(UUID campaignId) {
        return rosters.values().stream().filter(row -> row.campaignId().equals(campaignId))
                .sorted(Comparator.comparingInt(BasketballDomain.NationalTeamRoster::revision)).toList();
    }

    public List<BasketballDomain.TeamSeason> teamHistory(UUID teamId) {
        return participations.values().stream().filter(row -> row.teamId().equals(teamId))
                .sorted(Comparator.comparing(row -> row.period().startDate())).toList();
    }

    private BasketballDomain.Season season(UUID id, UUID leagueId) {
        return seasons.values().stream().filter(row -> row.id().equals(id) && row.leagueId().equals(leagueId))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("season/league identity mismatch"));
    }

    private void requireTeam(UUID id) {
        require(teams.values().stream().anyMatch(row -> row.id().equals(id)), "unknown team");
    }

    private void requireCompetition(UUID id) {
        require(competitions.values().stream().anyMatch(row -> row.id().equals(id)), "unknown competition");
    }

    private void validate(List<UUID> ids) {
        ids.forEach(evidence::requireValidated);
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalArgumentException(message);
        }
    }
}
