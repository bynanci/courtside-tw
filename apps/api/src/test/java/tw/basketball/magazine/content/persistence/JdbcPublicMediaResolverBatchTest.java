package tw.basketball.magazine.content.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.stream.IntStream;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

final class JdbcPublicMediaResolverBatchTest {
    @Test
    void resolvesManyReferencesWithOneBoundQuery() {
        CountingJdbcTemplate jdbcTemplate = new CountingJdbcTemplate();
        JdbcPublicMediaResolver resolver = new JdbcPublicMediaResolver(jdbcTemplate);
        List<JdbcPublicMediaResolver.MediaReference> references = List.of(
                new JdbcPublicMediaResolver.MediaReference(UUID.randomUUID(), "wide"),
                new JdbcPublicMediaResolver.MediaReference(UUID.randomUUID(), "inline")
        );

        assertTrue(resolver.resolveAll(
                references,
                Instant.parse("2026-08-13T00:00:00Z")
        ).isEmpty());
        assertEquals(1, jdbcTemplate.queryCount);
        assertEquals(8, jdbcTemplate.parameterCount);
        assertTrue(jdbcTemplate.sql.startsWith("WITH requested"));
        assertTrue(jdbcTemplate.sql.contains("revoked.status = 'REVOKED'"));
    }

    @Test
    void frozenMetadataVisibilityGateIsOneBoundFailClosedQuery() {
        CountingJdbcTemplate jdbcTemplate = new CountingJdbcTemplate();
        JdbcPublicMediaResolver resolver = new JdbcPublicMediaResolver(jdbcTemplate);
        List<JdbcPublicMediaResolver.MediaReference> references = List.of(
                new JdbcPublicMediaResolver.MediaReference(UUID.randomUUID(), "wide")
        );

        assertFalse(resolver.areAllVisible(
                references,
                Instant.parse("2026-08-13T00:00:00Z")
        ));
        assertEquals(1, jdbcTemplate.queryCount);
        assertEquals(5, jdbcTemplate.parameterCount);
        assertTrue(jdbcTemplate.sql.contains("revoked.status = 'REVOKED'"));
        assertTrue(jdbcTemplate.sql.contains("eligible.status = 'VALID'"));
        assertFalse(jdbcTemplate.sql.contains("public_storage_key"));
    }

    @Test
    void emptyReferenceSetDoesNotQueryTheDatabase() {
        CountingJdbcTemplate jdbcTemplate = new CountingJdbcTemplate();
        JdbcPublicMediaResolver resolver = new JdbcPublicMediaResolver(jdbcTemplate);

        assertEquals(List.of(), resolver.resolveAll(
                List.of(),
                Instant.parse("2026-08-13T00:00:00Z")
        ).orElseThrow());
        assertEquals(0, jdbcTemplate.queryCount);
    }

    @Test
    void oversizedAggregateReferenceSetFailsBeforeAnyDatabaseQuery() {
        CountingJdbcTemplate jdbcTemplate = new CountingJdbcTemplate();
        JdbcPublicMediaResolver resolver = new JdbcPublicMediaResolver(jdbcTemplate);
        List<JdbcPublicMediaResolver.MediaReference> oversized = IntStream.rangeClosed(
                        0,
                        JdbcPublicMediaResolver.MAXIMUM_BATCH_REFERENCES
                )
                .mapToObj(index -> new JdbcPublicMediaResolver.MediaReference(
                        new UUID(0L, index + 1L),
                        "inline"
                ))
                .toList();

        assertThrows(IllegalArgumentException.class, () -> resolver.resolveAll(
                oversized,
                Instant.parse("2026-08-13T00:00:00Z")
        ));
        assertEquals(0, jdbcTemplate.queryCount);
    }

    private static final class CountingJdbcTemplate extends JdbcTemplate {
        private int queryCount;
        private int parameterCount;
        private String sql;

        @Override
        public <T> List<T> query(String statement, RowMapper<T> rowMapper, Object... arguments) {
            queryCount++;
            parameterCount = arguments.length;
            sql = statement;
            return List.of();
        }
    }
}
