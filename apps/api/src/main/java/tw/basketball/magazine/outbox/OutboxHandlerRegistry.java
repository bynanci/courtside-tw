package tw.basketball.magazine.outbox;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Dispatches events only through explicitly registered exact event types. */
public final class OutboxHandlerRegistry implements OutboxEventHandler {
    private static final int MAX_REGISTRATIONS = 100;
    private final Map<String, OutboxEventHandler> handlers;

    public OutboxHandlerRegistry(List<OutboxHandlerRegistration> registrations) {
        Objects.requireNonNull(registrations, "registrations");
        if (registrations.isEmpty()) {
            throw new IllegalStateException("at least one outbox handler must be registered");
        }
        if (registrations.size() > MAX_REGISTRATIONS) {
            throw new IllegalStateException("outbox handler registrations exceed the bounded limit");
        }

        Map<String, OutboxEventHandler> mappedHandlers = new LinkedHashMap<>();
        for (OutboxHandlerRegistration registration : registrations) {
            Objects.requireNonNull(registration, "registration");
            if (mappedHandlers.putIfAbsent(
                    registration.eventType(),
                    registration.handler()
            ) != null) {
                throw new IllegalStateException(
                        "duplicate outbox handler registration: " + registration.eventType()
                );
            }
        }
        handlers = Collections.unmodifiableMap(mappedHandlers);
    }

    @Override
    public void handle(OutboxEvent event) throws OutboxHandlerException {
        Objects.requireNonNull(event, "event");
        OutboxEventHandler handler = handlers.get(event.eventType());
        if (handler == null) {
            throw new UnknownOutboxEventTypeException(event.eventType());
        }
        handler.handle(event);
    }

    public Set<String> eventTypes() {
        return Collections.unmodifiableSet(handlers.keySet());
    }
}
