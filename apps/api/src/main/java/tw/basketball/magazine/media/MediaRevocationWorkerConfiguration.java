package tw.basketball.magazine.media;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.media.application.MediaRevocationHandler;
import tw.basketball.magazine.outbox.OutboxHandlerRegistration;
import tw.basketball.magazine.publication.worker.PublicationExternalInvalidator;

/** Revocation retries remain registered even while an external purge provider is unavailable. */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
@ConditionalOnProperty(prefix = "courtside.outbox", name = "enabled", havingValue = "true")
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class})
public final class MediaRevocationWorkerConfiguration {
    @Bean
    public MediaRevocationHandler mediaRevocationHandler(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        return new MediaRevocationHandler(jdbcTemplate, new TransactionTemplate(transactionManager),
                objectMapper, PublicationExternalInvalidator.unavailable());
    }

    @Bean
    public OutboxHandlerRegistration mediaRevocationHandlerRegistration(MediaRevocationHandler handler) {
        return new OutboxHandlerRegistration(MediaRevocationHandler.EVENT_TYPE, handler);
    }
}
