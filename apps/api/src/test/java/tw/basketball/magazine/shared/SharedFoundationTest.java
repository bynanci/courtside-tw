package tw.basketball.magazine.shared;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

final class SharedFoundationTest {
    private static final Instant FIXED_INSTANT = Instant.parse("2026-08-08T03:04:05.006Z");
    private static final Clock FIXED_CLOCK = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);

    @Test
    void applicationClockIsDeterministicAndUtcByDefault() {
        ApplicationClock clock = new ApplicationClock(FIXED_CLOCK);

        assertEquals(FIXED_INSTANT, clock.now());
        assertEquals(LocalDate.of(2026, 8, 8), clock.today());
        assertEquals(ZoneOffset.UTC, clock.zone());
    }

    @Test
    void uuidV7ContainsTheInjectedTimestampAndCorrectVariant() {
        UuidV7Generator generator = new UuidV7Generator(FIXED_CLOCK, new SeededRandom(7L));

        UUID id = generator.next();

        assertTrue(UuidV7Generator.isUuidV7(id));
        assertEquals(FIXED_INSTANT.toEpochMilli(), UuidV7Generator.timestampOf(id).toEpochMilli());
        assertEquals(2, id.variant());
        assertEquals(7, id.version());
    }

    @Test
    void actorContextIsImmutableAndContainsNoCredentialMaterial() {
        Set<RoleCode> roles = EnumSet.of(RoleCode.EDITOR);
        ActorContext actor = ActorContext.user(
                "oidc|editor-1",
                roles,
                RequestId.of("req_t014_actor")
        );
        roles.add(RoleCode.ADMIN);

        assertEquals(ActorType.USER, actor.type());
        assertEquals("oidc|editor-1", actor.subject());
        assertEquals(Set.of(RoleCode.EDITOR), actor.roles());
        assertTrue(actor.hasRole(RoleCode.EDITOR));
        assertFalse(actor.hasRole(RoleCode.ADMIN));
        assertThrows(UnsupportedOperationException.class, () -> actor.roles().add(RoleCode.ADMIN));
    }

    @Test
    void optimisticLockAdvancesOnlyWhenTheExpectedVersionMatches() {
        Version current = new Version(2);

        assertEquals(new Version(3), OptimisticLock.advance(current, new Version(2)));
        assertEquals("\"2\"", current.toIfMatch());
        assertEquals(new Version(2), Version.parseIfMatch("\"2\""));
        assertEquals(new Version(2), Version.parseIfMatch("2"));

        VersionConflictException conflict = assertThrows(
                VersionConflictException.class,
                () -> OptimisticLock.advance(current, new Version(1))
        );
        assertEquals(new Version(1), conflict.expected());
        assertEquals(current, conflict.current());
    }

    @Test
    void ifMatchRejectsWildcardWeakTagsAndMalformedVersions() {
        assertThrows(IllegalArgumentException.class, () -> Version.parseIfMatch("*"));
        assertThrows(IllegalArgumentException.class, () -> Version.parseIfMatch("W/\"2\""));
        assertThrows(IllegalArgumentException.class, () -> Version.parseIfMatch("\"two\""));
        assertThrows(IllegalArgumentException.class, () -> Version.parseIfMatch("-1"));
        assertThrows(IllegalArgumentException.class, () -> Version.parseIfMatch("\"2\"\nX-Injected: true"));
    }

    @Test
    void problemDetailsUsesStableContractMetadataAndDoesNotExposeExceptionText() {
        RequestId requestId = RequestId.of("req_t014_problem");
        VersionConflictException conflict = new VersionConflictException(new Version(1), new Version(2));

        ProblemDetails problem = ProblemDetailsMapper.fromVersionConflict(
                conflict,
                "/api/v1/editor/issues/issue-1",
                requestId
        );

        assertEquals("https://courtside.tw/problems/version_conflict", problem.type());
        assertEquals("Conflict", problem.title());
        assertEquals(409, problem.status());
        assertEquals("The resource version is stale or the state conflicts.", problem.detail());
        assertEquals("/api/v1/editor/issues/issue-1", problem.instance());
        assertEquals(requestId.value(), problem.requestId());
        assertEquals("VERSION_CONFLICT", problem.code());
        assertTrue(problem.errors().isEmpty());
        assertFalse(problem.detail().contains(conflict.getMessage()));
    }

    @Test
    void problemDetailsKeepsFieldErrorsBoundedAndImmutable() {
        List<FieldError> errors = List.of(new FieldError("/title", "required", "Title is required."));

        ProblemDetails problem = ProblemDetailsMapper.invalidRequest(
                "/api/v1/editor/issues",
                RequestId.of("req_t014_fields"),
                errors
        );

        assertEquals(errors, problem.errors());
        assertThrows(UnsupportedOperationException.class, () -> problem.errors().add(
                new FieldError("/slug", "invalid", "Slug is invalid.")
        ));
        assertThrows(IllegalArgumentException.class, () -> new FieldError("/title\n", "bad", "message"));
    }

    private static final class SeededRandom extends Random {
        private static final long serialVersionUID = 1L;

        private SeededRandom(long seed) {
            super(seed);
        }
    }
}
