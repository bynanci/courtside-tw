package tw.basketball.magazine.readerlibrary;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import tw.basketball.magazine.readerlibrary.application.ReaderLibraryService;
import tw.basketball.magazine.shared.ApplicationClock;

/** Wires the reader-library bounded context when JDBC is available. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class})
public class ReaderLibraryConfiguration {
    @Bean
    @ConditionalOnMissingBean(ReaderLibraryService.class)
    ReaderLibraryService readerLibraryService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        return new ReaderLibraryService(
                jdbcTemplate,
                transactionManager,
                ApplicationClock.systemUtc()
        );
    }
}
