package tw.basketball.magazine.fanpassport;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import tw.basketball.magazine.fanpassport.persistence.JdbcPassportErasure;
import tw.basketball.magazine.identity.application.AccountLifecycleParticipant;

/** Lazy JDBC lookup preserves application startup ordering while account deletion stays transactional. */
@Configuration(proxyBeanMethods = false)
public class PassportAccountConfiguration {

  @Bean
  AccountLifecycleParticipant passportAccountErasure(ObjectProvider<JdbcTemplate> jdbc) {
    return (readerId, now) -> new JdbcPassportErasure(jdbc.getObject()).erase(readerId, now);
  }
}
