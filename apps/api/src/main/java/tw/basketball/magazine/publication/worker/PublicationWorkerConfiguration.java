package tw.basketball.magazine.publication.worker;

import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.JdbcAuditWriter;
import tw.basketball.magazine.outbox.OutboxHandlerRegistration;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.publication.persistence.EditorialArticleRepository;
import tw.basketball.magazine.search.worker.SearchProjectionHandler;
import tw.basketball.magazine.shared.UuidV7Generator;

/** Registers publication command processing for the worker profile only. */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
@ConditionalOnProperty(prefix = "courtside.outbox", name = "enabled", havingValue = "true")
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class})
public final class PublicationWorkerConfiguration {
    @Bean
    public PublicationJobHandler publicationJobHandler(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        EditorialArticleRepository repository = new JdbcEditorialArticleRepository(
                jdbcTemplate,
                objectMapper,
                UuidV7Generator.system()
        );
        return new PublicationJobHandler(
                repository,
                new TransactionTemplate(transactionManager),
                objectMapper,
                Clock.systemUTC(),
                PublicationExternalInvalidator.unavailable(),
                new SearchProjectionHandler(jdbcTemplate, objectMapper)
        );
    }

    @Bean
    public OutboxHandlerRegistration publicationJobHandlerRegistration(
            PublicationJobHandler handler
    ) {
        return new OutboxHandlerRegistration(PublicationJobHandler.EVENT_TYPE, handler);
    }

    @Bean
    public IssuePublicationJobHandler issuePublicationJobHandler(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        return new IssuePublicationJobHandler(
                new JdbcEditorialIssueRepository(jdbcTemplate, objectMapper),
                new JdbcAuditWriter(jdbcTemplate, objectMapper),
                new TransactionTemplate(transactionManager),
                objectMapper,
                Clock.systemUTC()
        );
    }

    @Bean
    public OutboxHandlerRegistration issuePublicationJobHandlerRegistration(
            IssuePublicationJobHandler handler
    ) {
        return new OutboxHandlerRegistration(IssuePublicationJobHandler.EVENT_TYPE, handler);
    }
}
