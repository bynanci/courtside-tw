package tw.basketball.magazine.shared.observability;

import java.time.Duration;
import java.util.Objects;
import java.util.Set;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

/**
 * Bounded operational metrics. Dynamic request paths, payloads, identities,
 * storage keys and wallet addresses are never metric labels.
 */
public final class CourtsideObservabilityMetrics {
    private static final String HTTP_REQUESTS = "courtside.http.server.requests";
    private static final String HTTP_DURATION = "courtside.http.server.duration";
    private static final String MEDIA_PROCESSING = "courtside.media.processing";
    private static final String MEDIA_BYTES = "courtside.media.processing.bytes";
    private static final String MEDIA_VARIANTS = "courtside.media.processing.variants";
    private static final String MOTION_LIFECYCLE = "courtside.motion.lifecycle";
    private static final String PROVENANCE_JOBS = "courtside.provenance.jobs";
    private static final Set<String> MEDIA_OUTCOMES = Set.of("READY", "FAILED", "REVOKED", "unknown");
    private static final Set<String> MEDIA_REASONS = Set.of(
            "checksum",
            "magic_bytes",
            "dimensions",
            "exif",
            "encoder",
            "rights",
            "unknown"
    );
    private static final Set<String> MOTION_SIGNALS = Set.of(
            "mount",
            "resume",
            "pause",
            "dispose",
            "error",
            "unknown"
    );
    private static final Set<String> PROVENANCE_STATES = Set.of(
            "PENDING",
            "VERIFIED",
            "FAILED",
            "WITHDRAWN",
            "unknown"
    );

    private final MeterRegistry registry;
    private final Set<String> allowedRoutes;
    private final Set<String> allowedProviders;

    public CourtsideObservabilityMetrics(
            MeterRegistry registry,
            Set<String> allowedRoutes,
            Set<String> allowedProviders
    ) {
        this.registry = Objects.requireNonNull(registry, "registry");
        this.allowedRoutes = ObservabilityLabelSanitizer.boundedAllowlist(allowedRoutes);
        this.allowedProviders = ObservabilityLabelSanitizer.boundedAllowlist(allowedProviders);
    }

    public CourtsideObservabilityMetrics(MeterRegistry registry) {
        this(registry, Set.of(), Set.of());
    }

    public void recordHttpRequest(
            String routeTemplate,
            String method,
            int status,
            Duration duration
    ) {
        Duration safeDuration = nonNegative(duration);
        String route = ObservabilityLabelSanitizer.allowlisted(routeTemplate, allowedRoutes);
        String safeMethod = ObservabilityLabelSanitizer.safeMethod(method);
        String statusBucket = ObservabilityLabelSanitizer.statusBucket(status);
        Counter.builder(HTTP_REQUESTS)
                .tag("route", route)
                .tag("method", safeMethod)
                .tag("status", statusBucket)
                .register(registry)
                .increment();
        Timer.builder(HTTP_DURATION)
                .tag("route", route)
                .tag("method", safeMethod)
                .tag("status", statusBucket)
                .register(registry)
                .record(safeDuration);
    }

    public void recordMediaProcessing(
            String outcome,
            String reason,
            long bytes,
            int variantCount,
            Duration duration
    ) {
        if (bytes < 0 || variantCount < 0) {
            throw new IllegalArgumentException("media metric values cannot be negative");
        }
        Counter.builder(MEDIA_PROCESSING)
                .tag("outcome", ObservabilityLabelSanitizer.allowlisted(outcome, MEDIA_OUTCOMES))
                .tag("reason", ObservabilityLabelSanitizer.allowlisted(reason, MEDIA_REASONS))
                .register(registry)
                .increment();
        Timer.builder(MEDIA_PROCESSING + ".duration")
                .register(registry)
                .record(nonNegative(duration));
        DistributionSummary.builder(MEDIA_BYTES)
                .baseUnit("bytes")
                .register(registry)
                .record(bytes);
        DistributionSummary.builder(MEDIA_VARIANTS)
                .register(registry)
                .record(variantCount);
    }

    public void recordMotionLifecycle(String signal, boolean reducedMotion) {
        Counter.builder(MOTION_LIFECYCLE)
                .tag("signal", ObservabilityLabelSanitizer.allowlisted(signal, MOTION_SIGNALS))
                .tag("reduced_motion", Boolean.toString(reducedMotion))
                .register(registry)
                .increment();
    }

    public void recordProvenanceJob(String state, String provider) {
        Counter.builder(PROVENANCE_JOBS)
                .tag("state", ObservabilityLabelSanitizer.allowlisted(state, PROVENANCE_STATES))
                .tag("provider", ObservabilityLabelSanitizer.allowlisted(provider, allowedProviders))
                .register(registry)
                .increment();
    }

    private static Duration nonNegative(Duration duration) {
        Objects.requireNonNull(duration, "duration");
        if (duration.isNegative()) {
            throw new IllegalArgumentException("duration cannot be negative");
        }
        return duration;
    }
}
