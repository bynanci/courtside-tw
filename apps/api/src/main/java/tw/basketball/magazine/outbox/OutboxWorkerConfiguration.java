package tw.basketball.magazine.outbox;

import java.time.Clock;
import java.util.List;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** Worker-only runtime wiring; the API profile receives persistence only. */
@Configuration(proxyBeanMethods = false)
@Profile("worker")
@ConditionalOnProperty(
        prefix = "courtside.outbox",
        name = "enabled",
        havingValue = "true"
)
@ConditionalOnBean(OutboxRepository.class)
public final class OutboxWorkerConfiguration {
    @Bean
    public OutboxHandlerRegistry outboxHandlerRegistry(
            List<OutboxHandlerRegistration> registrations
    ) {
        return new OutboxHandlerRegistry(registrations);
    }

    @Bean
    @ConditionalOnMissingBean(OutboxMetrics.class)
    public OutboxMetrics outboxMetrics(
            ObjectProvider<MeterRegistry> meterRegistries,
            OutboxHandlerRegistry handlerRegistry
    ) {
        MeterRegistry registry = meterRegistries.getIfAvailable();
        return registry == null
                ? NoopOutboxMetrics.INSTANCE
                : new MicrometerOutboxMetrics(registry, handlerRegistry.eventTypes());
    }

    @Bean
    public ThreadPoolTaskScheduler outboxTaskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("courtside-outbox-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        return scheduler;
    }

    @Bean
    public OutboxWorker outboxWorker(
            OutboxRepository repository,
            OutboxProperties properties,
            OutboxHandlerRegistry handlerRegistry,
            OutboxMetrics metrics
    ) {
        return new OutboxWorker(
                repository,
                properties,
                Clock.systemUTC(),
                handlerRegistry,
                metrics
        );
    }

    @Bean
    public OutboxScheduler outboxScheduler(
            ThreadPoolTaskScheduler taskScheduler,
            OutboxWorker worker,
            OutboxProperties properties,
            OutboxMetrics metrics
    ) {
        return new OutboxScheduler(
                taskScheduler,
                worker::runOnce,
                properties,
                Clock.systemUTC(),
                metrics
        );
    }
}
