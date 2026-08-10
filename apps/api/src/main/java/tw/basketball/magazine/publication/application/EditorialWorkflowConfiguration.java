package tw.basketball.magazine.publication.application;

import java.net.URI;
import java.time.Clock;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import javax.sql.DataSource;

import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.ObjectMapper;

/** Wires the JDBC editorial adapter only when the API has a database. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean(DataSource.class)
public final class EditorialWorkflowConfiguration {
    @Bean
    @ConditionalOnMissingBean(EditorialWorkflowService.class)
    public EditorialWorkflowService editorialWorkflowService(
            DataSource dataSource,
            ObjectMapper objectMapper,
            @Value("${courtside.media.upload-base-url:}") String uploadBaseUrl
    ) {
        URI configuredBaseUrl = uploadBaseUrl.isBlank() ? null : URI.create(uploadBaseUrl);
        return new EditorialWorkflowService(
                dataSource,
                objectMapper,
                Clock.systemUTC(),
                configuredBaseUrl
        );
    }
}
