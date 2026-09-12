package tw.basketball.magazine.fanpassport.archive;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ActorType;
import tw.basketball.magazine.shared.RoleCode;

/** Consent and rights boundary for historical photos, tickets and oral histories. */
public final class ArchiveContributionPolicy {
    private static final Set<String> CHANNELS = Set.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE", "IPFS", "CREDENTIAL");
    private static final Set<String> KINDS = Set.of("HISTORICAL_PHOTO", "TICKET", "ORAL_HISTORY");
    private static final Set<String> STATES = Set.of("DRAFT", "SUBMITTED", "ACCEPTED", "WITHDRAWN");

    private ArchiveContributionPolicy() {
    }

    public record Rights(UUID assetId, String rightsOwner, String license, Set<String> allowedChannels,
            boolean collectibleAllowed, boolean redistributionAllowed, Instant validFrom, Instant validUntil,
            String credit, String withdrawalPolicy, Instant withdrawnAt) {
        public Rights {
            Objects.requireNonNull(assetId, "assetId");
            text(rightsOwner, 200);
            text(license, 300);
            text(credit, 300);
            if (!"ORIGIN_WITHDRAWAL".equals(withdrawalPolicy)) {
                throw new IllegalArgumentException("withdrawal policy must deny origin presentation");
            }
            allowedChannels = Set.copyOf(allowedChannels);
            if (allowedChannels.isEmpty() || !CHANNELS.containsAll(allowedChannels)) {
                throw new IllegalArgumentException("unknown rights channel");
            }
            Objects.requireNonNull(validFrom, "validFrom");
            Objects.requireNonNull(validUntil, "validUntil");
            if (!validUntil.isAfter(validFrom)) {
                throw new IllegalArgumentException("invalid rights validity period");
            }
        }

        public boolean permits(String channel, Instant now) {
            Objects.requireNonNull(now, "now");
            return withdrawnAt == null && !now.isBefore(validFrom) && now.isBefore(validUntil)
                    && allowedChannels.contains(channel)
                    && (!"CREDENTIAL".equals(channel) || collectibleAllowed)
                    // Finite and revocable archive rights never imply perpetual mirror rights.
                    && !"IPFS".equals(channel);
        }

        public Rights withdraw(Instant effectiveAt) {
            Objects.requireNonNull(effectiveAt, "effectiveAt");
            return withdrawnAt == null ? new Rights(assetId, rightsOwner, license, allowedChannels,
                    collectibleAllowed, redistributionAllowed, validFrom, validUntil, credit,
                    withdrawalPolicy, effectiveAt) : this;
        }
    }

    public record StatusEvent(String status, UUID actorId, String reasonCode, Instant effectiveAt) {
        public StatusEvent {
            if (!STATES.contains(status) || reasonCode == null || !reasonCode.matches("[A-Z][A-Z_]{2,79}")) {
                throw new IllegalArgumentException("invalid sanitized archive status event");
            }
            Objects.requireNonNull(actorId, "actorId");
            Objects.requireNonNull(effectiveAt, "effectiveAt");
        }
    }

    public record Contribution(UUID id, UUID contributorAccountId, String kind, UUID assetId, String status,
            boolean consentGranted, Instant consentAt, Rights rights, List<StatusEvent> history) {
        public Contribution {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(contributorAccountId, "contributorAccountId");
            Objects.requireNonNull(assetId, "assetId");
            Objects.requireNonNull(consentAt, "consentAt");
            Objects.requireNonNull(rights, "rights");
            history = List.copyOf(history);
            if (!KINDS.contains(kind) || !STATES.contains(status) || !assetId.equals(rights.assetId())) {
                throw new IllegalArgumentException("invalid archive identity, kind, status or asset rights");
            }
            validateHistory(status, consentGranted, consentAt, rights, history);
        }

        /** actorId is the reader-profile ID resolved from the authenticated context by the identity application port. */
        public Contribution transition(String next, UUID actorId, ActorContext actor, String reasonCode, Instant effectiveAt) {
            Objects.requireNonNull(actor, "actor");
            boolean publisher = actor.type() == ActorType.USER && actor.hasRole(RoleCode.PUBLISHER);
            boolean owner = actor.type() == ActorType.USER && actor.hasRole(RoleCode.READER)
                    && contributorAccountId.equals(actorId);
            if (("ACCEPTED".equals(next) && !publisher)
                    || (!"ACCEPTED".equals(next) && !publisher && !owner)) {
                throw new IllegalArgumentException("archive transition requires its owner or an authorized publisher");
            }
            boolean accepted = "ACCEPTED".equals(next)
                    && ("DRAFT".equals(status) || "SUBMITTED".equals(status));
            boolean submitted = "SUBMITTED".equals(next) && "DRAFT".equals(status);
            boolean withdrawn = "WITHDRAWN".equals(next) && !"WITHDRAWN".equals(status);
            if ((!accepted && !submitted && !withdrawn) || effectiveAt.isBefore(consentAt)
                    || (!history.isEmpty() && effectiveAt.isBefore(history.get(history.size() - 1).effectiveAt()))) {
                throw new IllegalArgumentException("invalid archive transition");
            }
            if ((accepted || submitted) && (!consentGranted || !rights.permits("PUBLIC_WEB", effectiveAt))) {
                throw new IllegalArgumentException("consent and valid rights are required");
            }
            List<StatusEvent> events = new ArrayList<>(history);
            events.add(new StatusEvent(next, actorId, reasonCode, effectiveAt));
            return new Contribution(id, contributorAccountId, kind, assetId, next,
                    !withdrawn && consentGranted, consentAt,
                    withdrawn ? rights.withdraw(effectiveAt) : rights, events);
        }

        public Optional<Map<String, Object>> publicProjection(String channel, Instant now) {
            Objects.requireNonNull(now, "now");
            if (!"ACCEPTED".equals(status) || !consentGranted || now.isBefore(consentAt)
                    || now.isBefore(history.get(history.size() - 1).effectiveAt()) || !rights.permits(channel, now)) {
                return Optional.empty();
            }
            return Optional.of(Map.of("contributionId", id.toString(), "kind", kind,
                    "assetId", assetId.toString(), "credit", rights.credit(),
                    "rightsOwner", rights.rightsOwner(), "license", rights.license()));
        }
    }

    /** Rehydration must enforce the same lifecycle as commands, including terminal withdrawal. */
    private static void validateHistory(String status, boolean consentGranted, Instant consentAt,
            Rights rights, List<StatusEvent> history) {
        if (history.size() > 10000 || (!"DRAFT".equals(status) && history.isEmpty())
                || (("SUBMITTED".equals(status) || "ACCEPTED".equals(status)) && !consentGranted)
                || ("WITHDRAWN".equals(status) && consentGranted)) {
            throw new IllegalArgumentException("archive status requires bounded lifecycle and consent evidence");
        }
        String previous = "DRAFT";
        Instant previousAt = consentAt;
        for (int index = 0; index < history.size(); index++) {
            StatusEvent event = history.get(index);
            boolean creation = index == 0 && "DRAFT".equals(event.status());
            boolean allowed = ("DRAFT".equals(previous) && Set.of("SUBMITTED", "ACCEPTED", "WITHDRAWN").contains(event.status()))
                    || ("SUBMITTED".equals(previous) && Set.of("ACCEPTED", "WITHDRAWN").contains(event.status()))
                    || ("ACCEPTED".equals(previous) && "WITHDRAWN".equals(event.status()));
            if ((!creation && !allowed) || event.effectiveAt().isBefore(previousAt)) {
                throw new IllegalArgumentException("invalid or nonchronological archive lifecycle history");
            }
            if (("SUBMITTED".equals(event.status()) || "ACCEPTED".equals(event.status()))
                    && (!rights.allowedChannels().contains("PUBLIC_WEB") || event.effectiveAt().isBefore(rights.validFrom())
                        || !event.effectiveAt().isBefore(rights.validUntil())
                        || (rights.withdrawnAt() != null && event.effectiveAt().isAfter(rights.withdrawnAt())))) {
                throw new IllegalArgumentException("archive approval occurred without effective rights");
            }
            previous = event.status();
            previousAt = event.effectiveAt();
        }
        if (!previous.equals(status)) {
            throw new IllegalArgumentException("status must match complete append-only history");
        }
        if ("WITHDRAWN".equals(status) && (rights.withdrawnAt() == null || rights.withdrawnAt().isAfter(previousAt))) {
            throw new IllegalArgumentException("withdrawn archive must retain its effective rights withdrawal");
        }
    }

    private static void text(String value, int limit) {
        if (value == null || value.isBlank() || value.length() > limit
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("invalid archive public text");
        }
    }
}
