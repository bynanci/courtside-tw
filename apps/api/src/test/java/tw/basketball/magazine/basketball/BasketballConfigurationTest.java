package tw.basketball.magazine.basketball;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.domain.BasketballDomain;
import tw.basketball.magazine.basketball.ports.BasketballFactStore;
import tw.basketball.magazine.evidence.EvidenceStore;

final class BasketballConfigurationTest {
    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void anonymousAndReaderCannotWriteCanonicalFacts() {
        var store = mock(BasketballFactStore.class);
        var service = new BasketballConfiguration().basketballCatalogService(store, id -> { }, new ObjectMapper());
        var id = UUID.fromString("00000000-0000-4000-8000-000000000001");
        var player = new BasketballDomain.Player(id, List.of(new BasketballDomain.Alias(
                UUID.fromString("00000000-0000-4000-8000-000000000002"), id, "Synthetic player", "zh-TW",
                new BasketballDomain.Period(LocalDate.parse("2026-01-01"), null), List.of(id))), List.of(id));
        assertThrows(SecurityException.class, () -> service.append(player));
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                "fixture-reader", "unused", List.of(new SimpleGrantedAuthority("ROLE_READER"))));
        assertThrows(SecurityException.class, () -> service.append(player));
        verifyNoInteractions(store);
    }

    @Test
    void reviewActorCannotImpersonateAnotherPublisher() {
        var store = mock(EvidenceStore.class);
        var review = new BasketballConfiguration().basketballContradictionReview(store);
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                "fixture-publisher", "unused", List.of(new SimpleGrantedAuthority("ROLE_PUBLISHER"))));
        assertThrows(SecurityException.class, () -> review.decide(UUID.randomUUID(), "fixture.claim", UUID.randomUUID(),
                tw.basketball.magazine.evidence.Evidence.Status.CONFIRMED, "different-publisher", "Synthetic reason", 0,
                java.time.Instant.parse("2026-01-01T00:00:00Z")));
        verifyNoInteractions(store);
    }
}
