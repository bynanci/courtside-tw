package tw.basketball.magazine.media;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.media.application.EditorialMediaService;
import tw.basketball.magazine.media.application.EditorialMediaMetadataService;
import tw.basketball.magazine.media.application.PublisherMediaService;
import tw.basketball.magazine.media.persistence.JdbcMediaAssetRepository;
import tw.basketball.magazine.media.persistence.JdbcMediaUploadIdempotencyRepository;
import tw.basketball.magazine.media.persistence.MediaAssetRepository;
import tw.basketball.magazine.media.persistence.MediaUploadIdempotencyRepository;
import tw.basketball.magazine.media.storage.S3CompatibleStoragePort;
import tw.basketball.magazine.media.storage.StorageUploadPolicy;
import tw.basketball.magazine.outbox.OutboxRepository;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.UuidV7Generator;

/** Provider-neutral wiring for T048; no storage vendor is activated here. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, AuditWriter.class, PlatformTransactionManager.class})
public final class MediaConfiguration {
    @Bean
    @ConditionalOnMissingBean(MediaAssetRepository.class)
    public MediaAssetRepository mediaAssetRepository(JdbcTemplate jdbcTemplate) {
        return new JdbcMediaAssetRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(MediaUploadIdempotencyRepository.class)
    public MediaUploadIdempotencyRepository mediaUploadIdempotencyRepository(
            JdbcTemplate jdbcTemplate
    ) {
        return new JdbcMediaUploadIdempotencyRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(StorageUploadPolicy.class)
    public StorageUploadPolicy storageUploadPolicy() {
        return StorageUploadPolicy.standard();
    }

    @Bean
    @ConditionalOnBean({
        S3CompatibleStoragePort.class,
        OutboxRepository.class,
        MediaAssetRepository.class,
        MediaUploadIdempotencyRepository.class
    })
    @ConditionalOnMissingBean(EditorialMediaService.class)
    public EditorialMediaService editorialMediaService(
            MediaAssetRepository assetRepository,
            MediaUploadIdempotencyRepository receiptRepository,
            S3CompatibleStoragePort storagePort,
            OutboxRepository outboxRepository,
            AuditWriter auditWriter,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper,
            ApplicationClock applicationClock,
            StorageUploadPolicy uploadPolicy
    ) {
        return new EditorialMediaService(
                assetRepository,
                receiptRepository,
                storagePort,
                outboxRepository,
                auditWriter,
                new TransactionTemplate(transactionManager),
                objectMapper,
                applicationClock,
                uploadPolicy,
                UuidV7Generator.system()
        );
    }

    @Bean
    @ConditionalOnMissingBean(EditorialMediaMetadataService.class)
    public EditorialMediaMetadataService editorialMediaMetadataService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        return new EditorialMediaMetadataService(
                jdbcTemplate,
                auditWriter,
                new TransactionTemplate(transactionManager),
                objectMapper
        );
    }

    @Bean
    @ConditionalOnMissingBean(PublisherMediaService.class)
    public PublisherMediaService publisherMediaService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        return new PublisherMediaService(
                jdbcTemplate,
                auditWriter,
                new TransactionTemplate(transactionManager),
                objectMapper
        );
    }
}
