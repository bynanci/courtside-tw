package tw.basketball.magazine.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

final class OutboxHandlerRegistryTest {
    private static final UUID EVENT_ID =
            UUID.fromString("00000000-0000-4000-8000-000000000001");

    @Test
    void routesByExplicitEventTypeRegistration() throws Exception {
        AtomicReference<String> handled = new AtomicReference<>();
        OutboxHandlerRegistry registry = new OutboxHandlerRegistry(List.of(
                new OutboxHandlerRegistration(
                        "publication.issue.published",
                        event -> handled.set(event.eventType())
                ),
                new OutboxHandlerRegistration(
                        "publication.issue.withdrawn",
                        event -> handled.set(event.eventType())
                )
        ));

        registry.handle(event("publication.issue.published"));

        assertEquals("publication.issue.published", handled.get());
        assertEquals(
                List.of("publication.issue.published", "publication.issue.withdrawn"),
                registry.eventTypes().stream().sorted().toList()
        );
    }

    @Test
    void rejectsDuplicateEventTypeRegistrations() {
        assertThrows(
                IllegalStateException.class,
                () -> new OutboxHandlerRegistry(List.of(
                        new OutboxHandlerRegistration("duplicate", event -> { }),
                        new OutboxHandlerRegistration("duplicate", event -> { })
                ))
        );
    }

    @Test
    void rejectsAnEmptyRegistrationSet() {
        assertThrows(
                IllegalStateException.class,
                () -> new OutboxHandlerRegistry(List.of())
        );
    }

    @Test
    void unknownEventTypesArePermanentConfigurationFailures() {
        OutboxHandlerRegistry registry = new OutboxHandlerRegistry(List.of(
                new OutboxHandlerRegistration("known", event -> { })
        ));

        UnknownOutboxEventTypeException failure = assertThrows(
                UnknownOutboxEventTypeException.class,
                () -> registry.handle(event("unknown"))
        );

        assertFalse(failure.retryable());
    }

    private static OutboxEvent event(String eventType) {
        Instant now = Instant.parse("2026-08-08T12:00:00Z");
        return new OutboxEvent(
                EVENT_ID,
                eventType,
                "publication_issue",
                EVENT_ID,
                "registry-test",
                "{}",
                OutboxStatus.CLAIMED,
                now,
                1,
                "worker:claim",
                now.plusSeconds(30),
                null,
                now,
                now,
                null,
                null
        );
    }
}
