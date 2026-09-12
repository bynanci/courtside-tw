package tw.basketball.magazine.basketball.ports;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tw.basketball.magazine.basketball.domain.BasketballDomain;

/** Optional enrichment boundary. Empty projections must not block article origin reading. */
public interface BasketballProjection {
    Optional<BasketballDomain.Player> player(UUID playerId);
    List<BasketballDomain.PlayerTeamStint> career(UUID playerId);
    List<BasketballDomain.NationalTeamRoster> rosters(UUID campaignId);
}
