package tw.basketball.magazine.basketball.application;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.domain.BasketballDomain;
import tw.basketball.magazine.basketball.ports.BasketballFactStore;
import tw.basketball.magazine.basketball.ports.BasketballProjection;
import tw.basketball.magazine.basketball.ports.EvidenceLookup;

/** Hydrates authoritative durable history, validates under the catalog lock, and appends without mutation. */
public final class BasketballCatalogService implements BasketballProjection {
    private final BasketballFactStore store;
    private final EvidenceLookup evidence;
    private final ObjectMapper json;
    private final Runnable writeAuthority;

    public BasketballCatalogService(BasketballFactStore store, EvidenceLookup evidence, ObjectMapper json,
                                    Runnable writeAuthority) {
        this.store = Objects.requireNonNull(store, "store");
        this.evidence = Objects.requireNonNull(evidence, "evidence");
        this.json = Objects.requireNonNull(json, "json");
        this.writeAuthority = Objects.requireNonNull(writeAuthority, "writeAuthority");
    }

    public void append(Record value) {
        writeAuthority.run();
        BasketballFactStore.Fact fact = encode(value);
        store.transact(session -> {
            BasketballCatalog catalog = hydrate(session.history());
            add(catalog, value);
            session.append(fact);
            return null;
        });
    }

    @Override
    public Optional<BasketballDomain.Player> player(UUID playerId) {
        return hydrate(store.history()).player(playerId);
    }

    @Override
    public List<BasketballDomain.PlayerTeamStint> career(UUID playerId) {
        return hydrate(store.history()).career(playerId);
    }

    @Override
    public List<BasketballDomain.NationalTeamRoster> rosters(UUID campaignId) {
        return hydrate(store.history()).rosters(campaignId);
    }

    /** Enrichment clients may choose this explicit origin-first fallback; canonical mutation never falls back. */
    public Optional<BasketballProjection> optionalProjection() {
        try {
            return Optional.of(hydrate(store.history()));
        } catch (IllegalStateException unavailable) {
            return Optional.empty();
        }
    }

    private BasketballCatalog hydrate(List<BasketballFactStore.Fact> facts) {
        BasketballCatalog result = new BasketballCatalog(evidence);
        for (BasketballFactStore.Fact fact : facts) {
            Class<? extends Record> type = switch (fact.kind()) {
                case "LEAGUE" -> BasketballDomain.League.class;
                case "TEAM" -> BasketballDomain.Team.class;
                case "PLAYER" -> BasketballDomain.Player.class;
                case "SEASON" -> BasketballDomain.Season.class;
                case "TEAM_SEASON" -> BasketballDomain.TeamSeason.class;
                case "PLAYER_TEAM_STINT" -> BasketballDomain.PlayerTeamStint.class;
                case "COMPETITION" -> BasketballDomain.Competition.class;
                case "TOURNAMENT" -> BasketballDomain.Tournament.class;
                case "GAME" -> BasketballDomain.Game.class;
                case "NATIONAL_TEAM_CAMPAIGN" -> BasketballDomain.NationalTeamCampaign.class;
                case "NATIONAL_TEAM_ROSTER" -> BasketballDomain.NationalTeamRoster.class;
                default -> throw new IllegalStateException("unsupported persisted basketball fact kind");
            };
            Record record = json.readValue(fact.payload(), type);
            BasketballFactStore.Fact bound = encode(record);
            if (!fact.id().equals(bound.id()) || !fact.ownerId().equals(bound.ownerId()) || !fact.kind().equals(bound.kind())
                    || !Objects.equals(fact.identityKind(), bound.identityKind()) || !Objects.equals(fact.validFrom(), bound.validFrom())
                    || !Objects.equals(fact.validTo(), bound.validTo()) || !fact.evidenceIds().equals(bound.evidenceIds())) {
                throw new IllegalStateException("persisted basketball fact metadata mismatch");
            }
            add(result, record);
        }
        return result;
    }

    private BasketballFactStore.Fact encode(Record value) {
        String payload = json.writeValueAsString(value);
        if (value instanceof BasketballDomain.League row) {
            return identity(row.id(), "LEAGUE", row.aliases().get(0).period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.Team row) {
            return identity(row.id(), "TEAM", row.aliases().get(0).period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.Player row) {
            return identity(row.id(), "PLAYER", row.aliases().get(0).period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.Season row) {
            return identity(row.id(), "SEASON", row.period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.TeamSeason row) {
            return fact(row.id(), row.teamId(), "TEAM_SEASON", null, row.period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.PlayerTeamStint row) {
            return fact(row.id(), row.playerId(), "PLAYER_TEAM_STINT", null, row.period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.Competition row) {
            // A competition identity has no period claim; unknown dates stay absent.
            return identity(row.id(), "COMPETITION", null, payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.Tournament row) {
            return identity(row.id(), "TOURNAMENT", row.period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.Game row) {
            LocalDate day = row.startsAt().atZone(ZoneOffset.UTC).toLocalDate();
            return identity(row.id(), "GAME", new BasketballDomain.Period(day, day.plusDays(1)), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.NationalTeamCampaign row) {
            return identity(row.id(), "NATIONAL_TEAM_CAMPAIGN", row.period(), payload, row.evidenceIds());
        }
        if (value instanceof BasketballDomain.NationalTeamRoster row) {
            return fact(row.id(), row.campaignId(), "NATIONAL_TEAM_ROSTER", null,
                    new BasketballDomain.Period(row.effectiveAt(), null), payload, row.evidenceIds());
        }
        throw new IllegalArgumentException("unsupported canonical basketball record");
    }

    private static BasketballFactStore.Fact identity(UUID id, String kind, BasketballDomain.Period period,
                                                     String payload, List<UUID> evidenceIds) {
        return fact(id, id, kind, kind, period, payload, evidenceIds);
    }

    private static BasketballFactStore.Fact fact(UUID id, UUID owner, String kind, String identityKind,
                                                BasketballDomain.Period period, String payload, List<UUID> evidenceIds) {
        return new BasketballFactStore.Fact(id, owner, kind, identityKind,
                period == null ? null : period.startDate(), period == null ? null : period.endDate(), payload, evidenceIds);
    }

    private static void add(BasketballCatalog catalog, Record value) {
        if (value instanceof BasketballDomain.League row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.Team row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.Player row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.Season row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.TeamSeason row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.PlayerTeamStint row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.Competition row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.Tournament row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.Game row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.NationalTeamCampaign row) {
            catalog.add(row);
        } else if (value instanceof BasketballDomain.NationalTeamRoster row) {
            catalog.add(row);
        } else {
            throw new IllegalArgumentException("unsupported canonical basketball record");
        }
    }
}
