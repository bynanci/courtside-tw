package tw.basketball.magazine.audit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.ObjectMapper;

/** Wires the audit boundary only when the application has a JDBC data source. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean(JdbcTemplate.class)
public final class AuditConfiguration {
    @Bean
    @ConditionalOnMissingBean(AuditWriter.class)
    public AuditWriter auditWriter(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        return new JdbcAuditWriter(jdbcTemplate, objectMapper);
    }
}
