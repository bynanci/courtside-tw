package tw.basketball.magazine.media;

import java.net.URI;
import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

import tw.basketball.magazine.media.application.PrivateMediaPreviewService;
import tw.basketball.magazine.media.storage.PrivateMediaPreviewReader;
import tw.basketball.magazine.media.storage.S3PrivateMediaPreviewReader;

/** Explicit server-owned credentials activate the private S3 read adapter; missing config stays unavailable. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean(JdbcTemplate.class)
public final class PrivateMediaPreviewConfiguration {
    private static final String PREFIX = "courtside.media.preview.s3.";

    @Bean
    @ConditionalOnMissingBean(PrivateMediaPreviewReader.class)
    public PrivateMediaPreviewReader privateMediaPreviewReader(Environment environment) {
        if (!environment.getProperty(PREFIX + "enabled", Boolean.class, false)) {
            return PrivateMediaPreviewReader.unavailable();
        }
        try {
            return new S3PrivateMediaPreviewReader(
                    URI.create(environment.getRequiredProperty(PREFIX + "endpoint")),
                    environment.getRequiredProperty(PREFIX + "bucket"),
                    environment.getRequiredProperty(PREFIX + "region"),
                    environment.getRequiredProperty(PREFIX + "access-key"),
                    environment.getRequiredProperty(PREFIX + "secret-key"),
                    environment.getProperty(PREFIX + "session-token", ""),
                    environment.getProperty(PREFIX + "allow-local-http", Boolean.class, false),
                    Clock.systemUTC());
        } catch (IllegalArgumentException | IllegalStateException exception) {
            return PrivateMediaPreviewReader.unavailable();
        }
    }

    @Bean
    public PrivateMediaPreviewService privateMediaPreviewService(JdbcTemplate jdbcTemplate, PrivateMediaPreviewReader reader) {
        return new PrivateMediaPreviewService(jdbcTemplate, reader);
    }
}
