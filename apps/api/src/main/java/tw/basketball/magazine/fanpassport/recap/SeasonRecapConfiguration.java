package tw.basketball.magazine.fanpassport.recap;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
public class SeasonRecapConfiguration {
    @Bean
    @Lazy
    JdbcSeasonRecapSource seasonRecapSource(JdbcTemplate jdbc, ObjectMapper json) {
        return new JdbcSeasonRecapSource(jdbc, json, java.time.Instant::now);
    }

    @Bean
    @Lazy
    SeasonRecapProjectionService seasonRecapProjectionService(JdbcSeasonRecapSource source) {
        return new SeasonRecapProjectionService(source, java.time.Instant::now);
    }

    @Bean
    @Lazy
    SeasonRecapApplication seasonRecapApplication(JdbcTemplate jdbc, ObjectMapper json,
            JdbcSeasonRecapSource source, SeasonRecapProjectionService engine, PlatformTransactionManager manager) {
        return new SeasonRecapApplication(jdbc, json, source, engine, manager, java.time.Instant::now);
    }
}
