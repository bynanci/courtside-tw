package tw.basketball.magazine.publication.application;

import java.util.Objects;
import java.util.regex.Pattern;

import tw.basketball.magazine.publication.domain.PublicationAction;

public final class PublicationIdempotencyPolicy {
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");

    public Resolution resolve(Request request, StoredResult existing) {
        Objects.requireNonNull(request, "request");
        if (existing == null) {
            return Resolution.newRequest();
        }
        if (!existing.request().scope().equals(request.scope())) {
            return Resolution.conflict();
        }
        if (!existing.request().requestHashSha256().equals(request.requestHashSha256())) {
            return Resolution.conflict();
        }
        return Resolution.replay(existing.response());
    }

    public record Request(
            String actorSubject,
            PublicationAction operation,
            String idempotencyKey,
            String requestHashSha256
    ) {
        public Request {
            requireBoundedText(actorSubject, "actorSubject");
            Objects.requireNonNull(operation, "operation");
            requireBoundedText(idempotencyKey, "idempotencyKey");
            if (requestHashSha256 == null || !SHA256.matcher(requestHashSha256).matches()) {
                throw new IllegalArgumentException("requestHashSha256 must be a SHA-256 hex digest");
            }
        }

        public Scope scope() {
            return new Scope(actorSubject, operation, idempotencyKey);
        }

        private static void requireBoundedText(String value, String name) {
            if (value == null || value.isBlank() || value.length() > 512) {
                throw new IllegalArgumentException(name + " must be non-blank and at most 512 characters");
            }
        }
    }

    public record StoredResult(Request request, String response) {
        public StoredResult {
            Objects.requireNonNull(request, "request");
            if (response == null || response.isBlank()) {
                throw new IllegalArgumentException("response must be non-blank");
            }
        }
    }

    public record Scope(
            String actorSubject,
            PublicationAction operation,
            String idempotencyKey
    ) {
    }

    public record Resolution(Outcome outcome, String response) {
        public Resolution {
            Objects.requireNonNull(outcome, "outcome");
            if (outcome == Outcome.REPLAY && (response == null || response.isBlank())) {
                throw new IllegalArgumentException("replay requires the stored response");
            }
            if (outcome != Outcome.REPLAY && response != null) {
                throw new IllegalArgumentException("only replay resolutions contain a response");
            }
        }

        public static Resolution newRequest() {
            return new Resolution(Outcome.NEW, null);
        }

        public static Resolution replay(String response) {
            return new Resolution(Outcome.REPLAY, response);
        }

        public static Resolution conflict() {
            return new Resolution(Outcome.CONFLICT, null);
        }
    }

    public enum Outcome {
        NEW,
        REPLAY,
        CONFLICT
    }
}
