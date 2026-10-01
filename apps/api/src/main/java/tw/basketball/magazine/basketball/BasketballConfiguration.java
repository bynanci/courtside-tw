package tw.basketball.magazine.basketball;

import java.util.Set;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.basketball.application.BasketballCatalogService;
import tw.basketball.magazine.basketball.application.NormalizationIntake;
import tw.basketball.magazine.basketball.application.ReviewedEvidenceIntake;
import tw.basketball.magazine.basketball.application.CanonicalBasketballIntake;
import tw.basketball.magazine.basketball.persistence.JdbcBasketballFactStore;
import tw.basketball.magazine.basketball.ports.BasketballFactStore;
import tw.basketball.magazine.basketball.ports.EvidenceLookup;
import tw.basketball.magazine.evidence.ContradictionReview;
import tw.basketball.magazine.evidence.EvidenceStore;
import tw.basketball.magazine.evidence.EvidenceValidation;
import tw.basketball.magazine.evidence.JdbcEvidenceStore;
import tw.basketball.magazine.shared.ApplicationClock;

/** Explicit editorial data access only: no scheduled ingest, provider call or startup database mutation. */
@Configuration(proxyBeanMethods = false)
@Lazy
public class BasketballConfiguration {
    private static final Set<String> REVIEW_ROLES = Set.of("ROLE_PUBLISHER", "ROLE_ADMIN");

    @Bean
    @ConditionalOnMissingBean(EvidenceStore.class)
    EvidenceStore basketballEvidenceStore(DataSource dataSource) {
        return new JdbcEvidenceStore(dataSource);
    }

    @Bean
    @ConditionalOnMissingBean(BasketballFactStore.class)
    BasketballFactStore basketballFactStore(DataSource dataSource) {
        return new JdbcBasketballFactStore(dataSource);
    }

    @Bean
    @ConditionalOnMissingBean(EvidenceLookup.class)
    EvidenceLookup basketballEvidenceLookup(EvidenceStore store) {
        return id -> EvidenceValidation.validate(store.reference(id)
                .orElseThrow(() -> new IllegalArgumentException("canonical fact has missing evidence")), store);
    }

    @Bean
    @ConditionalOnMissingBean(ContradictionReview.class)
    ContradictionReview basketballContradictionReview(EvidenceStore store) {
        return new ContradictionReview(store, claimedActor -> {
            Authentication authentication = requirePublisher();
            if (!authentication.getName().equals(claimedActor)) {
                throw new SecurityException("review actor must match the authenticated identity");
            }
        });
    }

    @Bean
    @ConditionalOnMissingBean(NormalizationIntake.class)
    NormalizationIntake basketballNormalizationIntake(EvidenceStore store, ContradictionReview review) {
        return new NormalizationIntake(store, review);
    }

    @Bean
    @ConditionalOnMissingBean(BasketballCatalogService.class)
    BasketballCatalogService basketballCatalogService(BasketballFactStore store, EvidenceLookup evidence, ObjectMapper json) {
        return new BasketballCatalogService(store, evidence, json, BasketballConfiguration::requirePublisher);
    }

    @Bean
    @ConditionalOnMissingBean(ReviewedEvidenceIntake.class)
    ReviewedEvidenceIntake basketballReviewedEvidenceIntake(EvidenceStore store, ContradictionReview review, ObjectProvider<ApplicationClock> clocks) {
        ApplicationClock clock = clocks.getIfAvailable(ApplicationClock::systemUtc);
        return new ReviewedEvidenceIntake(store, review, () -> requirePublisher().getName(), clock::now);
    }

    @Bean
    @ConditionalOnMissingBean(CanonicalBasketballIntake.class)
    CanonicalBasketballIntake basketballCanonicalIntake(BasketballCatalogService catalog, ReviewedEvidenceIntake review, ObjectMapper json) {
        return new CanonicalBasketballIntake(catalog, review, json);
    }

    static Authentication requirePublisher() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken
                || authentication.getAuthorities().stream().noneMatch(authority -> REVIEW_ROLES.contains(authority.getAuthority()))) {
            throw new SecurityException("canonical domain changes require publisher or admin authorization");
        }
        return authentication;
    }
}
