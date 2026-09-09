package tw.basketball.magazine.content;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.content.application.EditorialContributorService;

/** Enables contributor commands only with durable database and audit storage. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, AuditWriter.class, PlatformTransactionManager.class})
public final class EditorialContributorConfiguration {
    @Bean
    public EditorialContributorService editorialContributorService(JdbcTemplate jdbc, AuditWriter audit,
            PlatformTransactionManager transactions, ObjectMapper json) {
        return new EditorialContributorService(jdbc, audit, new TransactionTemplate(transactions), json);
    }
}
