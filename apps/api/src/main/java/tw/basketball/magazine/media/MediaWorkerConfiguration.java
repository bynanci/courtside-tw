package tw.basketball.magazine.media;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.media.application.EditorialMediaOutboxHandler;
import tw.basketball.magazine.media.persistence.MediaAssetRepository;
import tw.basketball.magazine.media.processing.MediaProcessingService;
import tw.basketball.magazine.media.storage.PrivateObjectReader;
import tw.basketball.magazine.media.storage.PublicVariantWriter;
import tw.basketball.magazine.outbox.OutboxHandlerRegistration;

/** Registers the media processor only when a provider adapter is supplied. */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
@ConditionalOnProperty(prefix = "courtside.outbox", name = "enabled", havingValue = "true")
@ConditionalOnBean({
        MediaAssetRepository.class,
        PrivateObjectReader.class,
        MediaProcessingService.class,
        PublicVariantWriter.class
})
public final class MediaWorkerConfiguration {
    @Bean
    public EditorialMediaOutboxHandler editorialMediaOutboxHandler(
            MediaAssetRepository assetRepository,
            PrivateObjectReader privateObjectReader,
            MediaProcessingService processingService,
            PublicVariantWriter publicVariantWriter,
            ObjectMapper objectMapper
    ) {
        return new EditorialMediaOutboxHandler(
                assetRepository, privateObjectReader, processingService, publicVariantWriter, objectMapper
        );
    }

    @Bean
    public OutboxHandlerRegistration mediaProcessingHandlerRegistration(
            EditorialMediaOutboxHandler handler
    ) {
        return new OutboxHandlerRegistration(EditorialMediaOutboxHandler.EVENT_TYPE, handler);
    }
}
