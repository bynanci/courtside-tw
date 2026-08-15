package tw.basketball.magazine.identity;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.identity.application.AccountDataService;
import tw.basketball.magazine.shared.ApplicationClock;

/** Wires verified account-data operations when persistence and audit are available. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class, AuditWriter.class})
public class IdentityAccountConfiguration {
    @Bean
    @ConditionalOnMissingBean(AccountDataService.class)
    AccountDataService accountDataService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            AuditWriter auditWriter
    ) {
        return new AccountDataService(
                jdbcTemplate,
                transactionManager,
                auditWriter,
                ApplicationClock.systemUtc()
        );
    }
}
