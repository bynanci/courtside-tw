package tw.basketball.magazine.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Registers the servlet boundary filters without adding provider capabilities. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public final class SecurityBoundaryConfiguration {
    @Bean
    public SecurityHeadersFilter securityHeadersFilter() {
        return new SecurityHeadersFilter();
    }

    @Bean
    public RequestPayloadLimitFilter requestPayloadLimitFilter() {
        return new RequestPayloadLimitFilter();
    }
}
