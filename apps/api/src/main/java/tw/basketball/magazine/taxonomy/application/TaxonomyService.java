package tw.basketball.magazine.taxonomy.application;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tw.basketball.magazine.search.application.SearchTextNormalizer;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.FieldError;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.taxonomy.domain.TaxonomyKind;
import tw.basketball.magazine.taxonomy.domain.TaxonomyStatus;

/** Transactional taxonomy management keyed only by immutable keys and UUIDs. */
public final class TaxonomyService {
    private static final Pattern TERM_KEY = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final Pattern LOCALE = Pattern.compile("[a-z]{2,3}(?:-[A-Z]{2})?");
    private static final int MAX_NAME_LENGTH = 250;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    public TaxonomyService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "jdbcTemplate");
        transactionTemplate = new TransactionTemplate(
                Objects.requireNonNull(transactionManager, "transactionManager")
        );
    }

    public TaxonomyPage list(String kind, String status) {
        TaxonomyKind parsedKind = optionalKind(kind);
        TaxonomyStatus parsedStatus = optionalStatus(status);
        StringBuilder sql = new StringBuilder("""
                SELECT id, term_key, kind, display_name, locale, valid_from,
                       valid_until, status, version
                FROM taxonomy_term
                WHERE 1 = 1
                """);
        java.util.ArrayList<Object> parameters = new java.util.ArrayList<>();
        if (parsedKind != null) {
            sql.append(" AND kind = ?");
            parameters.add(parsedKind.name());
        }
        if (parsedStatus != null) {
            sql.append(" AND status = ?");
            parameters.add(parsedStatus.name());
        }
        sql.append(" ORDER BY kind, term_key, id LIMIT 200");
        List<TaxonomyTerm> items = jdbcTemplate.query(
                sql.toString(),
                (resultSet, rowNumber) -> term(resultSet.getObject("id", UUID.class), resultSet),
                parameters.toArray()
        );
        return new TaxonomyPage(items);
    }

    public TaxonomyTerm create(ActorContext actor, CreateTerm command) {
        requireEditor(actor);
        Objects.requireNonNull(command, "command");
        String key = termKey(command.key());
        TaxonomyKind kind = parseKind(command.kind(), "/kind");
        String displayName = name(command.displayName(), "/displayName");
        String locale = locale(command.locale());
        Instant validFrom = command.validFrom() == null ? Instant.now() : command.validFrom();
        validateValidity(validFrom, command.validUntil(), "/validUntil");
        try {
            UUID id = jdbcTemplate.queryForObject("""
                    INSERT INTO taxonomy_term (
                        term_key, kind, display_name, locale, valid_from, valid_until, status
                    ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
                    RETURNING id
                    """, UUID.class, key, kind.name(), displayName, locale,
                    Timestamp.from(validFrom), timestamp(command.validUntil()));
            return find(id);
        } catch (DuplicateKeyException exception) {
            throw TaxonomyProblemException.invalid(
                    "/key",
                    "taxonomy_key_conflict",
                    "taxonomy key already exists"
            );
        }
    }

    public TaxonomyTerm update(
            ActorContext actor,
            UUID termId,
            Version expected,
            UpdateTerm command
    ) {
        requireEditor(actor);
        Objects.requireNonNull(termId, "termId");
        Objects.requireNonNull(expected, "expected");
        Objects.requireNonNull(command, "command");
        return transactionTemplate.execute(status -> {
            TaxonomyTerm current = lock(termId);
            assertVersion(expected, current.version());
            String displayName = command.displayName() == null
                    ? current.displayName() : name(command.displayName(), "/displayName");
            String locale = command.locale() == null
                    ? current.locale() : locale(command.locale());
            Instant validFrom = command.validFrom() == null
                    ? current.validFrom() : command.validFrom();
            Instant validUntil = command.clearValidUntil()
                    ? null
                    : command.validUntil() == null ? current.validUntil() : command.validUntil();
            TaxonomyStatus taxonomyStatus = command.status() == null
                    ? current.status() : parseStatus(command.status(), "/status");
            validateValidity(validFrom, validUntil, "/validUntil");
            jdbcTemplate.update("""
                    UPDATE taxonomy_term
                    SET display_name = ?, locale = ?, valid_from = ?, valid_until = ?,
                        status = ?, updated_at = transaction_timestamp(), version = version + 1
                    WHERE id = ? AND version = ?
                    """, displayName, locale, Timestamp.from(validFrom), timestamp(validUntil),
                    taxonomyStatus.name(), termId, expected.value());
            return find(termId);
        });
    }

    public TaxonomyTerm addAlias(
            ActorContext actor,
            UUID termId,
            Version expected,
            CreateAlias command
    ) {
        requireEditor(actor);
        Objects.requireNonNull(termId, "termId");
        Objects.requireNonNull(expected, "expected");
        Objects.requireNonNull(command, "command");
        return transactionTemplate.execute(status -> {
            TaxonomyTerm current = lock(termId);
            assertVersion(expected, current.version());
            String alias = name(command.alias(), "/alias");
            String normalized = SearchTextNormalizer.normalize(alias);
            if (normalized.isBlank()) {
                throw TaxonomyProblemException.invalid(
                        "/alias",
                        "taxonomy_alias_empty",
                        "alias must contain searchable text"
                );
            }
            String locale = locale(command.locale());
            Instant validFrom = command.validFrom() == null ? Instant.now() : command.validFrom();
            validateValidity(validFrom, command.validUntil(), "/validUntil");
            try {
                jdbcTemplate.update("""
                        INSERT INTO taxonomy_alias (
                            term_id, alias, normalized_alias, locale, valid_from, valid_until
                        ) VALUES (?, ?, ?, ?, ?, ?)
                        """, termId, alias, normalized, locale, Timestamp.from(validFrom),
                        timestamp(command.validUntil()));
            } catch (DuplicateKeyException exception) {
                throw TaxonomyProblemException.invalid(
                        "/alias",
                        "taxonomy_alias_conflict",
                        "alias revision already exists"
                );
            }
            jdbcTemplate.update("""
                    UPDATE taxonomy_term
                    SET updated_at = transaction_timestamp(), version = version + 1
                    WHERE id = ? AND version = ?
                    """, termId, expected.value());
            return find(termId);
        });
    }

    private TaxonomyTerm lock(UUID termId) {
        List<TaxonomyTerm> rows = jdbcTemplate.query("""
                SELECT id, term_key, kind, display_name, locale, valid_from,
                       valid_until, status, version
                FROM taxonomy_term
                WHERE id = ?
                FOR UPDATE
                """, (resultSet, rowNumber) -> term(termId, resultSet), termId);
        if (rows.isEmpty()) {
            throw TaxonomyProblemException.notFound("/termId");
        }
        return rows.getFirst();
    }

    private TaxonomyTerm find(UUID termId) {
        List<TaxonomyTerm> rows = jdbcTemplate.query("""
                SELECT id, term_key, kind, display_name, locale, valid_from,
                       valid_until, status, version
                FROM taxonomy_term
                WHERE id = ?
                """, (resultSet, rowNumber) -> term(termId, resultSet), termId);
        if (rows.isEmpty()) {
            throw TaxonomyProblemException.notFound("/termId");
        }
        return rows.getFirst();
    }

    private TaxonomyTerm term(UUID termId, java.sql.ResultSet resultSet)
            throws java.sql.SQLException {
        List<TaxonomyAlias> aliases = jdbcTemplate.query("""
                SELECT id, alias, normalized_alias, locale, valid_from, valid_until, version
                FROM taxonomy_alias
                WHERE term_id = ?
                ORDER BY valid_from, id
                """, (aliasResult, rowNumber) -> new TaxonomyAlias(
                        aliasResult.getObject("id", UUID.class),
                        aliasResult.getString("alias"),
                        aliasResult.getString("normalized_alias"),
                        aliasResult.getString("locale"),
                        aliasResult.getTimestamp("valid_from").toInstant(),
                        instant(aliasResult.getTimestamp("valid_until")),
                        aliasResult.getLong("version")
                ), termId);
        return new TaxonomyTerm(
                termId,
                resultSet.getString("term_key"),
                TaxonomyKind.valueOf(resultSet.getString("kind")),
                resultSet.getString("display_name"),
                resultSet.getString("locale"),
                resultSet.getTimestamp("valid_from").toInstant(),
                instant(resultSet.getTimestamp("valid_until")),
                TaxonomyStatus.valueOf(resultSet.getString("status")),
                resultSet.getLong("version"),
                aliases
        );
    }

    private static void requireEditor(ActorContext actor) {
        if (actor == null || !actor.hasRole(RoleCode.EDITOR)) {
            throw TaxonomyProblemException.forbidden();
        }
    }

    private static void assertVersion(Version expected, long current) {
        Version currentVersion = new Version(current);
        if (!expected.equals(currentVersion)) {
            throw new TaxonomyProblemException(
                    ProblemCode.VERSION_CONFLICT,
                    List.of(FieldError.currentVersion(currentVersion))
            );
        }
    }

    private static String termKey(String value) {
        if (value == null || !TERM_KEY.matcher(value).matches() || value.length() > 256) {
            throw TaxonomyProblemException.invalid(
                    "/key",
                    "taxonomy_key_invalid",
                    "key must be a bounded lowercase slug"
            );
        }
        return value;
    }

    private static String name(String value, String path) {
        if (value == null || value.isBlank() || value.length() > MAX_NAME_LENGTH
                || value.codePoints().anyMatch(Character::isISOControl)) {
            throw TaxonomyProblemException.invalid(
                    path,
                    "taxonomy_name_invalid",
                    "name must be bounded and free of control characters"
            );
        }
        return value.trim();
    }

    private static String locale(String value) {
        String candidate = value == null || value.isBlank() ? "zh-TW" : value.trim();
        if (!LOCALE.matcher(candidate).matches()) {
            throw TaxonomyProblemException.invalid(
                    "/locale",
                    "taxonomy_locale_invalid",
                    "locale must be a supported language tag"
            );
        }
        return candidate;
    }

    private static TaxonomyKind parseKind(String value, String path) {
        try {
            return TaxonomyKind.parse(value);
        } catch (IllegalArgumentException exception) {
            throw TaxonomyProblemException.invalid(path, "taxonomy_kind_invalid", exception.getMessage());
        }
    }

    private static TaxonomyStatus parseStatus(String value, String path) {
        try {
            return TaxonomyStatus.parse(value);
        } catch (IllegalArgumentException exception) {
            throw TaxonomyProblemException.invalid(path, "taxonomy_status_invalid", exception.getMessage());
        }
    }

    private static TaxonomyKind optionalKind(String value) {
        return value == null || value.isBlank() ? null : parseKind(value, "/kind");
    }

    private static TaxonomyStatus optionalStatus(String value) {
        return value == null || value.isBlank() ? null : parseStatus(value, "/status");
    }

    private static void validateValidity(Instant validFrom, Instant validUntil, String path) {
        if (validUntil != null && !validUntil.isAfter(validFrom)) {
            throw TaxonomyProblemException.invalid(
                    path,
                    "taxonomy_validity_invalid",
                    "validUntil must be after validFrom"
            );
        }
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    public record CreateTerm(
            String key,
            String kind,
            String displayName,
            String locale,
            Instant validFrom,
            Instant validUntil
    ) {
    }

    public record UpdateTerm(
            String displayName,
            String locale,
            Instant validFrom,
            Instant validUntil,
            boolean clearValidUntil,
            String status
    ) {
    }

    public record CreateAlias(
            String alias,
            String locale,
            Instant validFrom,
            Instant validUntil
    ) {
    }

    public record TaxonomyAlias(
            UUID id,
            String alias,
            String normalizedAlias,
            String locale,
            Instant validFrom,
            Instant validUntil,
            long version
    ) {
    }

    public record TaxonomyTerm(
            UUID id,
            String key,
            TaxonomyKind kind,
            String displayName,
            String locale,
            Instant validFrom,
            Instant validUntil,
            TaxonomyStatus status,
            long version,
            List<TaxonomyAlias> aliases
    ) {
        public TaxonomyTerm {
            aliases = List.copyOf(aliases);
        }
    }

    public record TaxonomyPage(List<TaxonomyTerm> items) {
        public TaxonomyPage {
            items = List.copyOf(items);
        }
    }
}
