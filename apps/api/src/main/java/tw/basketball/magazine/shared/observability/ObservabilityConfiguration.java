package tw.basketball.magazine.shared.observability;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Activates request tracing only inside the servlet API profile. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnBean(MeterRegistry.class)
public final class ObservabilityConfiguration {
    @Bean
    public CourtsideObservabilityMetrics courtsideObservabilityMetrics(
            MeterRegistry meterRegistry
    ) {
        return new CourtsideObservabilityMetrics(meterRegistry);
    }

    @Bean
    public RequestTraceFilter requestTraceFilter(
            CourtsideObservabilityMetrics metrics
    ) {
        return new RequestTraceFilter(metrics);
    }
}
