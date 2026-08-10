package tw.basketball.magazine.publication;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.publication.application.EditorialIssueService;
import tw.basketball.magazine.publication.persistence.EditorialArticleRepository;
import tw.basketball.magazine.publication.persistence.EditorialIssueRepository;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.publication.persistence.JdbcEditorialIssueRepository;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.shared.ApplicationClock;

/** Wires the bounded Editorial article slice when JDBC is available. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, AuditWriter.class, PlatformTransactionManager.class})
public final class EditorialConfiguration {
    @Bean
    @ConditionalOnMissingBean(ApplicationClock.class)
    public ApplicationClock applicationClock() {
        return ApplicationClock.systemUtc();
    }

    @Bean
    @ConditionalOnMissingBean(EditorialArticleRepository.class)
    public EditorialArticleRepository editorialArticleRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcEditorialArticleRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(EditorialIssueRepository.class)
    public EditorialIssueRepository editorialIssueRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcEditorialIssueRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(EditorialWorkflowService.class)
    public EditorialWorkflowService editorialWorkflowService(
            EditorialArticleRepository repository,
            AuditWriter auditWriter,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper,
            ApplicationClock applicationClock,
            ObjectProvider<OutboxRepository> outboxRepositories
    ) {
        return new EditorialWorkflowService(
                repository,
                auditWriter,
                new TransactionTemplate(transactionManager),
                objectMapper,
                applicationClock,
                outboxRepositories.getIfAvailable()
        );
    }

    @Bean
    @ConditionalOnMissingBean(EditorialIssueService.class)
    public EditorialIssueService editorialIssueService(
            EditorialIssueRepository repository,
            AuditWriter auditWriter,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        return new EditorialIssueService(
                repository,
                auditWriter,
                new TransactionTemplate(transactionManager),
                objectMapper
        );
    }
}
