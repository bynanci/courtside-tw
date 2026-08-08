package tw.basketball.magazine.outbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import javax.sql.DataSource;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

final class OutboxConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(OutboxConfiguration.class, OutboxWorkerConfiguration.class)
            .withBean(DataSource.class, () -> mock(DataSource.class));

    @Test
    void disabledOutboxDoesNotCreateWorkerInfrastructure() {
        contextRunner
                .withPropertyValues(
                        "courtside.outbox.enabled=false",
                        "spring.profiles.active=worker"
                )
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(OutboxRepository.class);
                    assertThat(context).doesNotHaveBean(OutboxHandlerRegistry.class);
                    assertThat(context).doesNotHaveBean(OutboxScheduler.class);
                });
    }

    @Test
    void apiProfileProvidesPersistenceWithoutStartingAWorker() {
        contextRunner
                .withPropertyValues(
                        "courtside.outbox.enabled=true",
                        "spring.profiles.active=api"
                )
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(OutboxRepository.class);
                    assertThat(context).doesNotHaveBean(OutboxScheduler.class);
                });
    }

    @Test
    void workerProfileRequiresExplicitHandlerRegistration() {
        contextRunner
                .withPropertyValues(
                        "courtside.outbox.enabled=true",
                        "spring.profiles.active=worker",
                        "courtside.outbox.initial-delay=PT1H"
                )
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void workerProfileCreatesRegistrySchedulerAndMetricsWhenRegistered() {
        contextRunner
                .withPropertyValues(
                        "courtside.outbox.enabled=true",
                        "spring.profiles.active=worker",
                        "courtside.outbox.initial-delay=PT1H"
                )
                .withBean(
                        OutboxHandlerRegistration.class,
                        () -> new OutboxHandlerRegistration(
                                "publication.issue.published",
                                event -> { }
                        )
                )
                .withBean(MeterRegistry.class, SimpleMeterRegistry::new)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(OutboxHandlerRegistry.class);
                    assertThat(context).hasSingleBean(OutboxScheduler.class);
                    assertThat(context).hasSingleBean(OutboxMetrics.class);
                });
    }
}
