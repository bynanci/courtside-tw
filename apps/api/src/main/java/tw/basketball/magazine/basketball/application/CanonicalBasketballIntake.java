package tw.basketball.magazine.basketball.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.domain.BasketballDomain;
import tw.basketball.magazine.evidence.Evidence;

/** One reviewed immutable fact per request; dependency order and temporal joins remain catalog-owned. */
public final class CanonicalBasketballIntake {
    private final BasketballCatalogService catalog;
    private final ReviewedEvidenceIntake reviewed;
    private final ObjectMapper json;

    public CanonicalBasketballIntake(BasketballCatalogService catalog, ReviewedEvidenceIntake reviewed, ObjectMapper json) {
        this.catalog = Objects.requireNonNull(catalog, "catalog");
        this.reviewed = Objects.requireNonNull(reviewed, "reviewed");
        this.json = BasketballIntakeJson.strict(Objects.requireNonNull(json, "json"));
    }

    public record Receipt(UUID factId, String kind, String reviewKey, List<UUID> evidenceIds) {
        public Receipt {
            evidenceIds = List.copyOf(evidenceIds);
        }
    }

    public Receipt append(String kind, JsonNode payload, String rationale) {
        Objects.requireNonNull(kind, "kind");
        if (payload == null || !payload.isObject() || payload.toString().length() > 48000) {
            throw new IllegalArgumentException("one bounded canonical record is required");
        }
        Class<? extends Record> type = switch (kind) {
            case "ALIAS" -> BasketballDomain.Alias.class;
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
            default -> throw new IllegalArgumentException("unsupported canonical basketball kind");
        };
        Record record;
        try {
            record = json.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(payload.toString());
        } catch (JacksonException failure) {
            throw new IllegalArgumentException("canonical record does not match its declared kind", failure);
        }
        Set<UUID> ids = new LinkedHashSet<>();
        collectEvidence(payload, ids, 0);
        if (ids.isEmpty() || ids.size() > 32) {
            throw new IllegalArgumentException("one fact may use 1..32 distinct reviewed evidence references");
        }
        ids.forEach(reviewed::requireConfirmed);
        UUID factId = UUID.fromString(payload.path("id").asString());
        String reviewKey = "basketball:fact:" + factId;
        List<UUID> evidenceIds = ids.stream().sorted().toList();
        catalog.appendReviewed(record, fact -> {
            evidenceIds.forEach(reviewed::requireConfirmed);
            reviewed.recordDecision(reviewKey, "sha256:" + Evidence.digest(fact.payload()), evidenceIds, rationale);
        });
        return new Receipt(factId, kind, reviewKey, evidenceIds);
    }

    private static void collectEvidence(JsonNode node, Set<UUID> ids, int depth) {
        if (depth > 8 || (node.isArray() && node.size() > 32)) {
            throw new IllegalArgumentException("canonical nested collections are limited to 32 entries and depth 8");
        }
        if (node.isObject()) {
            for (var property : node.properties()) {
                if ("evidenceIds".equals(property.getKey())) {
                    JsonNode references = property.getValue();
                    if (!references.isArray() || references.isEmpty() || references.size() > 32) {
                        throw new IllegalArgumentException("every evidence list must contain 1..32 references");
                    }
                    for (JsonNode reference : references) {
                        ids.add(UUID.fromString(reference.asString()));
                    }
                } else {
                    collectEvidence(property.getValue(), ids, depth + 1);
                }
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) {
                collectEvidence(item, ids, depth + 1);
            }
        }
    }
}
