package tw.basketball.magazine.taxonomy;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import tw.basketball.magazine.taxonomy.application.TaxonomyService;

/** Wires taxonomy management when JDBC transactions are available. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class})
public final class TaxonomyConfiguration {
    @Bean
    @ConditionalOnMissingBean(TaxonomyService.class)
    public TaxonomyService taxonomyService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        return new TaxonomyService(jdbcTemplate, transactionManager);
    }
}
