package tw.basketball.magazine.testsupport;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/** De-identified, deterministic foundation scenarios shared by integration tests. */
public final class FixtureCatalog {
    public static final long FIXED_CANVAS_SEED = 424_242L;

    private FixtureCatalog() {
    }

    public static List<Scenario> scenarios() {
        return List.of(
                new Scenario(
                        "published",
                        PublicationState.PUBLISHED,
                        RightsState.VALID,
                        false,
                        generativeCanvasValid().canvas()
                ),
                new Scenario(
                        "draft",
                        PublicationState.DRAFT,
                        RightsState.VALID,
                        false,
                        generativeCanvasValid().canvas()
                ),
                new Scenario(
                        "withdrawn",
                        PublicationState.WITHDRAWN,
                        RightsState.WITHDRAWN,
                        false,
                        generativeCanvasValid().canvas()
                ),
                new Scenario(
                        "expired-rights",
                        PublicationState.PUBLISHED,
                        RightsState.EXPIRED,
                        false,
                        generativeCanvasValid().canvas()
                ),
                new Scenario(
                        "reduced-motion",
                        PublicationState.PUBLISHED,
                        RightsState.VALID,
                        true,
                        generativeCanvasValid().canvas()
                )
        );
    }

    public static Scenario generativeCanvasValid() {
        return new Scenario(
                "generative-canvas-valid",
                PublicationState.PUBLISHED,
                RightsState.VALID,
                false,
                new CanvasFixture(
                        "court-pulse-v1",
                        FIXED_CANVAS_SEED,
                        Map.of("density", 0.35, "amplitude", 0.6),
                        true,
                        "valid"
                )
        );
    }

    public static Scenario generativeCanvasInvalid() {
        return new Scenario(
                "generative-canvas-invalid",
                PublicationState.PUBLISHED,
                RightsState.VALID,
                false,
                new CanvasFixture(
                        "court-pulse-v1",
                        FIXED_CANVAS_SEED,
                        Map.of("density", 101.0, "amplitude", 0.6),
                        false,
                        "parameter-out-of-range"
                )
        );
    }

    public enum PublicationState {
        PUBLISHED,
        DRAFT,
        WITHDRAWN
    }

    public enum RightsState {
        VALID,
        EXPIRED,
        WITHDRAWN
    }

    public record Scenario(
            String id,
            PublicationState publicationState,
            RightsState rightsState,
            boolean reducedMotion,
            CanvasFixture canvas
    ) {
        public Scenario {
            id = requireText(id, "id");
            publicationState = Objects.requireNonNull(publicationState, "publicationState");
            rightsState = Objects.requireNonNull(rightsState, "rightsState");
            canvas = Objects.requireNonNull(canvas, "canvas");
        }
    }

    public record CanvasFixture(
            String presetId,
            long seed,
            Map<String, Double> parameters,
            boolean valid,
            String validationCode
    ) {
        public CanvasFixture {
            presetId = requireText(presetId, "presetId");
            if (parameters == null || parameters.isEmpty() || parameters.size() > 8) {
                throw new IllegalArgumentException("canvas parameters must contain 1 to 8 values");
            }
            parameters = Map.copyOf(parameters);
            validationCode = requireText(validationCode, "validationCode");
        }

        @Override
        public Map<String, Double> parameters() {
            return Map.copyOf(parameters);
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isBlank() || normalized.length() > 96) {
            throw new IllegalArgumentException(field + " must be a bounded value");
        }
        return normalized;
    }
}
