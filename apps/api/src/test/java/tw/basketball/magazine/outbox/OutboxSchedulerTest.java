package tw.basketball.magazine.outbox;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.TaskScheduler;

final class OutboxSchedulerTest {
    @Test
    void schedulesUsingValidatedInitialDelayAndPollInterval() {
        TaskScheduler taskScheduler = mock(TaskScheduler.class);
        ScheduledFuture<?> scheduledFuture = mock(ScheduledFuture.class);
        AtomicReference<Runnable> task = new AtomicReference<>();
        when(taskScheduler.scheduleWithFixedDelay(
                any(Runnable.class),
                any(Instant.class),
                eq(Duration.ofSeconds(5))
        )).thenAnswer(invocation -> {
            task.set(invocation.getArgument(0));
            return scheduledFuture;
        });
        OutboxProperties properties = new OutboxProperties(
                true,
                "worker-scheduler",
                10,
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(4),
                Duration.ofSeconds(5),
                Duration.ofSeconds(2)
        );
        OutboxScheduler scheduler = new OutboxScheduler(
                taskScheduler,
                () -> { },
                properties,
                Clock.fixed(
                        Instant.parse("2026-08-08T12:00:00Z"),
                        ZoneOffset.UTC
                ),
                NoopOutboxMetrics.INSTANCE
        );

        scheduler.start();

        verify(taskScheduler).scheduleWithFixedDelay(
                any(Runnable.class),
                eq(Instant.parse("2026-08-08T12:00:02Z")),
                eq(Duration.ofSeconds(5))
        );
        scheduler.stop();
        verify(scheduledFuture).cancel(false);
    }
}
