package tw.basketball.magazine.outbox;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
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

    @Test
    void stopCallbackWaitsForAnInFlightRunToFinish() throws Exception {
        TaskScheduler taskScheduler = mock(TaskScheduler.class);
        ScheduledFuture<?> scheduledFuture = mock(ScheduledFuture.class);
        AtomicReference<Runnable> task = new AtomicReference<>();
        when(taskScheduler.scheduleWithFixedDelay(
                any(Runnable.class),
                any(Instant.class),
                any(Duration.class)
        )).thenAnswer(invocation -> {
            task.set(invocation.getArgument(0));
            return scheduledFuture;
        });
        CountDownLatch taskStarted = new CountDownLatch(1);
        CountDownLatch releaseTask = new CountDownLatch(1);
        CountDownLatch callbackCalled = new CountDownLatch(1);
        OutboxScheduler scheduler = new OutboxScheduler(
                taskScheduler,
                () -> {
                    taskStarted.countDown();
                    await(releaseTask);
                },
                validProperties(),
                Clock.systemUTC(),
                NoopOutboxMetrics.INSTANCE
        );

        scheduler.start();
        Thread worker = new Thread(task.get()::run);
        worker.start();
        assertThat(taskStarted.await(1, TimeUnit.SECONDS)).isTrue();

        try {
            scheduler.stop(callbackCalled::countDown);

            assertThat(callbackCalled.await(100, TimeUnit.MILLISECONDS)).isFalse();
            releaseTask.countDown();
            assertThat(callbackCalled.await(1, TimeUnit.SECONDS)).isTrue();
        } finally {
            releaseTask.countDown();
            worker.join(1_000);
        }
        verify(scheduledFuture).cancel(false);
    }

    @Test
    void recordsSkippedWhenASecondRunOverlaps() throws Exception {
        TaskScheduler taskScheduler = mock(TaskScheduler.class);
        ScheduledFuture<?> scheduledFuture = mock(ScheduledFuture.class);
        AtomicReference<Runnable> task = new AtomicReference<>();
        when(taskScheduler.scheduleWithFixedDelay(
                any(Runnable.class),
                any(Instant.class),
                any(Duration.class)
        )).thenAnswer(invocation -> {
            task.set(invocation.getArgument(0));
            return scheduledFuture;
        });
        CountDownLatch taskStarted = new CountDownLatch(1);
        CountDownLatch releaseTask = new CountDownLatch(1);
        OutboxMetrics metrics = mock(OutboxMetrics.class);
        OutboxScheduler scheduler = new OutboxScheduler(
                taskScheduler,
                () -> {
                    taskStarted.countDown();
                    await(releaseTask);
                },
                validProperties(),
                Clock.systemUTC(),
                metrics
        );

        scheduler.start();
        Thread worker = new Thread(task.get()::run);
        worker.start();
        assertThat(taskStarted.await(1, TimeUnit.SECONDS)).isTrue();

        try {
            task.get().run();
            verify(metrics).recordSchedulerSkipped();
        } finally {
            releaseTask.countDown();
            worker.join(1_000);
        }
    }

    @Test
    void recordsFailureWhenScheduledTaskThrows() {
        TaskScheduler taskScheduler = mock(TaskScheduler.class);
        ScheduledFuture<?> scheduledFuture = mock(ScheduledFuture.class);
        AtomicReference<Runnable> task = new AtomicReference<>();
        when(taskScheduler.scheduleWithFixedDelay(
                any(Runnable.class),
                any(Instant.class),
                any(Duration.class)
        )).thenAnswer(invocation -> {
            task.set(invocation.getArgument(0));
            return scheduledFuture;
        });
        OutboxMetrics metrics = mock(OutboxMetrics.class);
        OutboxScheduler scheduler = new OutboxScheduler(
                taskScheduler,
                () -> {
                    throw new IllegalStateException("expected test failure");
                },
                validProperties(),
                Clock.systemUTC(),
                metrics
        );

        scheduler.start();
        task.get().run();

        verify(metrics).recordSchedulerFailure();
    }

    @Test
    void rejectsZeroOrSubMillisecondPollIntervals() {
        assertIllegalArgument(() -> new OutboxProperties(
                true,
                "worker",
                10,
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(4),
                Duration.ZERO,
                Duration.ZERO
        ));
        assertIllegalArgument(() -> new OutboxProperties(
                true,
                "worker",
                10,
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(4),
                Duration.ofNanos(1),
                Duration.ZERO
        ));
    }

    @Test
    void rejectsSubMillisecondOrOverOneHourInitialDelay() {
        assertIllegalArgument(() -> new OutboxProperties(
                true,
                "worker",
                10,
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(4),
                Duration.ofSeconds(5),
                Duration.ofNanos(1)
        ));
        assertIllegalArgument(() -> new OutboxProperties(
                true,
                "worker",
                10,
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(4),
                Duration.ofSeconds(5),
                Duration.ofHours(1).plusNanos(1)
        ));
    }

    private static OutboxProperties validProperties() {
        return new OutboxProperties(
                true,
                "worker-scheduler",
                10,
                Duration.ofSeconds(30),
                3,
                Duration.ofSeconds(1),
                Duration.ofSeconds(4),
                Duration.ofSeconds(5),
                Duration.ZERO
        );
    }

    private static void assertIllegalArgument(Runnable action) {
        assertThrows(IllegalArgumentException.class, action::run);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("test task timed out");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("test task interrupted", interrupted);
        }
    }
}
