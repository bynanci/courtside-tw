package tw.basketball.magazine.identity;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tw.basketball.magazine.audit.AuditWriter;

/** Durable observation service, separate from authoritative provider administration. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, AuditWriter.class, PlatformTransactionManager.class})
public final class SecurityAuditConfiguration {
    @Bean
    public VerifiedRoleAuditService verifiedRoleAuditService(JdbcTemplate jdbc, AuditWriter audit,
            PlatformTransactionManager transactions) {
        return new VerifiedRoleAuditService(jdbc, audit, new TransactionTemplate(transactions), Clock.systemUTC());
    }
}
