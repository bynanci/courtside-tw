package tw.basketball.magazine.outbox;

import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(
        prefix = "courtside.outbox",
        name = "enabled",
        havingValue = "true"
)
@ConditionalOnBean(DataSource.class)
@EnableConfigurationProperties(OutboxProperties.class)
public final class OutboxConfiguration {
    @Bean
    public OutboxRepository outboxRepository(JdbcTemplate jdbcTemplate) {
        return new OutboxRepository(jdbcTemplate);
    }

    @Bean
    @Profile("worker")
    @ConditionalOnBean(OutboxEventHandler.class)
    public OutboxWorker outboxWorker(
            OutboxRepository repository,
            OutboxProperties properties,
            OutboxEventHandler handler
    ) {
        return new OutboxWorker(repository, properties, java.time.Clock.systemUTC(), handler);
    }
}
