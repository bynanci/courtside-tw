package tw.basketball.magazine.outbox;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.SmartLifecycle;
import org.springframework.scheduling.TaskScheduler;

/** One-thread, lifecycle-aware scheduler for the worker's bounded runOnce loop. */
public final class OutboxScheduler implements SmartLifecycle {
    private final TaskScheduler taskScheduler;
    private final Runnable task;
    private final OutboxProperties properties;
    private final Clock clock;
    private final OutboxMetrics metrics;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean taskRunning = new AtomicBoolean();
    private ScheduledFuture<?> scheduledTask;

    public OutboxScheduler(
            TaskScheduler taskScheduler,
            Runnable task,
            OutboxProperties properties,
            Clock clock,
            OutboxMetrics metrics
    ) {
        this.taskScheduler = Objects.requireNonNull(taskScheduler, "taskScheduler");
        this.task = Objects.requireNonNull(task, "task");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.metrics = Objects.requireNonNull(metrics, "metrics");
    }

    @Override
    public synchronized void start() {
        if (running.get()) {
            return;
        }
        running.set(true);
        Instant firstRun = clock.instant().plus(properties.initialDelay());
        try {
            scheduledTask = taskScheduler.scheduleWithFixedDelay(
                    this::runSafely,
                    firstRun,
                    properties.pollInterval()
            );
        } catch (RuntimeException failure) {
            running.set(false);
            metrics.recordSchedulerFailure();
            throw failure;
        }
    }

    @Override
    public synchronized void stop() {
        running.set(false);
        if (scheduledTask != null) {
            scheduledTask.cancel(false);
            scheduledTask = null;
        }
    }

    @Override
    public void stop(Runnable callback) {
        Objects.requireNonNull(callback, "callback");
        stop();
        callback.run();
    }

    @Override
    public boolean isRunning() {
        return running.get();
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    private void runSafely() {
        if (!running.get() || !taskRunning.compareAndSet(false, true)) {
            if (running.get()) {
                metrics.recordSchedulerSkipped();
            }
            return;
        }
        try {
            task.run();
        } catch (RuntimeException failure) {
            metrics.recordSchedulerFailure();
        } finally {
            taskRunning.set(false);
        }
    }
}
