package tw.basketball.magazine.content.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RoleCode;
import tw.basketball.magazine.shared.Version;
import tw.basketball.magazine.shared.VersionConflictException;

/** Audited contributor identities and ordered, draft-only revision credit. */
public final class EditorialContributorService {
    private static final Set<String> CREDIT_ROLES = Set.of("AUTHOR", "EDITOR", "PHOTOGRAPHER", "ILLUSTRATOR", "TRANSLATOR", "DESIGNER");
    private final JdbcTemplate jdbc;
    private final AuditWriter audit;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    public EditorialContributorService(JdbcTemplate jdbc, AuditWriter audit,
            TransactionTemplate transactions, ObjectMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.json = Objects.requireNonNull(json, "json");
    }

    public JsonNode list(ActorContext actor, String status) {
        editor(actor);
        String filter = status == null ? "ACTIVE" : status;
        if (!Set.of("ACTIVE", "ARCHIVED", "ALL").contains(filter)) {
            throw invalid("/status", "status must be ACTIVE, ARCHIVED or ALL");
        }
        return json.valueToTree(Map.of("items", jdbc.query("""
                SELECT id, slug, display_name, status, version FROM contributor
                WHERE (? = 'ALL' OR status = ?) ORDER BY slug, id LIMIT 100
                """, (rs, row) -> Map.of("contributorId", rs.getString("id"),
                        "slug", rs.getString("slug"), "displayName", rs.getString("display_name"),
                        "status", rs.getString("status"), "version", rs.getLong("version")), filter, filter)));
    }

    public JsonNode get(ActorContext actor, UUID id) {
        editor(actor);
        return contributor(id, false);
    }

    public JsonNode create(ActorContext actor, String key, JsonNode command) {
        editor(actor);
        fields(command, Set.of("slug", "displayName"));
        String slug = text(command, "slug", 128);
        if (!slug.matches("[a-z0-9]+(-[a-z0-9]+)*")) {
            throw invalid("/slug", "slug must be canonical lowercase words");
        }
        String name = text(command, "displayName", 200);
        return execute(actor, "CREATE", key, command.toString(), () -> {
            UUID id = UUID.randomUUID();
            try {
                jdbc.update("INSERT INTO contributor (id, slug, display_name, version) VALUES (?, ?, ?, 1)", id, slug, name);
            } catch (DuplicateKeyException exception) {
                throw conflict("/slug", "contributor slug already exists");
            }
            audit.append(new AuditEventDraft(actor, "CONTRIBUTOR_CREATED", "CONTRIBUTOR", id, Map.of("version", 1)));
            return contributor(id, false);
        });
    }

    public JsonNode update(ActorContext actor, UUID id, Version version, String key, JsonNode command, boolean archive) {
        editor(actor);
        fields(command, archive ? Set.of("reason") : Set.of("displayName"));
        String value = text(command, archive ? "reason" : "displayName", archive ? 1000 : 200);
        String operation = archive ? "ARCHIVE" : "UPDATE";
        return execute(actor, operation, key, id + ":" + version.value() + ":" + command, () -> {
            JsonNode current = contributor(id, true);
            checkVersion(version, current.path("version").asLong());
            if (!"ACTIVE".equals(current.path("status").asString())) {
                throw conflict("/status", "archived contributors cannot be changed");
            }
            if (!archive && Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM article_contributor WHERE contributor_id = ?)", Boolean.class, id))) {
                throw conflict("/displayName", "assigned credit is immutable; create a new contributor identity");
            }
            if (archive) {
                jdbc.update("UPDATE contributor SET status = 'ARCHIVED', version = version + 1, updated_at = transaction_timestamp() WHERE id = ?", id);
            } else {
                jdbc.update("UPDATE contributor SET display_name = ?, version = version + 1, updated_at = transaction_timestamp() WHERE id = ?", value, id);
            }
            audit.append(new AuditEventDraft(actor, "CONTRIBUTOR_" + (archive ? "ARCHIVED" : "UPDATED"), "CONTRIBUTOR", id,
                    archive ? Map.of("version", version.value() + 1, "reason", value) : Map.of("version", version.value() + 1)));
            return contributor(id, false);
        });
    }

    public JsonNode credits(ActorContext actor, UUID article, UUID revision) {
        editor(actor);
        List<Long> versions = jdbc.query("""
                SELECT article.version FROM article JOIN article_revision ON article_revision.article_id = article.id
                WHERE article.id = ? AND article_revision.id = ?
                """, (rs, row) -> rs.getLong(1), article, revision);
        if (versions.isEmpty()) {
            throw EditorialProblemException.notFound("/revisionId", "article revision was not found");
        }
        List<Map<String, Object>> credits = jdbc.query("""
                SELECT contributor.id, contributor.slug, contributor.display_name, article_contributor.role
                FROM article_contributor JOIN contributor ON contributor.id = article_contributor.contributor_id
                WHERE article_contributor.article_revision_id = ? ORDER BY article_contributor.position, article_contributor.id
                """, (rs, row) -> Map.of("contributorId", rs.getString("id"), "slug", rs.getString("slug"),
                        "displayName", rs.getString("display_name"), "role", rs.getString("role")), revision);
        return json.valueToTree(Map.of("articleId", article.toString(), "revisionId", revision.toString(),
                "version", versions.getFirst(), "contributors", credits));
    }

    public JsonNode assign(ActorContext actor, UUID article, UUID revision, Version version, String key, JsonNode command) {
        editor(actor);
        fields(command, Set.of("contributors"));
        JsonNode credits = command.get("contributors");
        if (credits == null || !credits.isArray() || credits.size() > 50) {
            throw invalid("/contributors", "contributors must be an array of at most 50 credits");
        }
        Set<String> unique = new HashSet<>();
        List<Credit> requested = new ArrayList<>();
        for (JsonNode credit : credits) {
            fields(credit, Set.of("contributorId", "role"));
            UUID id = UUID.fromString(text(credit, "contributorId", 36));
            String role = text(credit, "role", 20);
            if (!CREDIT_ROLES.contains(role) || !unique.add(id + ":" + role)) {
                throw invalid("/contributors", "credit role must be supported and person/role must be unique");
            }
            requested.add(new Credit(id, role));
        }
        return execute(actor, "ASSIGN", key, article + ":" + revision + ":" + version.value() + ":" + command, () -> {
            List<Long> versions = jdbc.query("SELECT version FROM article WHERE id = ? FOR UPDATE", (rs, row) -> rs.getLong(1), article);
            if (versions.isEmpty()) {
                throw EditorialProblemException.notFound("/articleId", "article was not found");
            }
            checkVersion(version, versions.getFirst());
            List<String> states = jdbc.query("""
                    SELECT state FROM article_revision WHERE id = ? AND article_id = ?
                    AND revision_number = (SELECT max(revision_number) FROM article_revision WHERE article_id = ?)
                    FOR UPDATE
                    """, (rs, row) -> rs.getString(1), revision, article, article);
            if (states.isEmpty() || !"DRAFT".equals(states.getFirst())) {
                throw conflict("/revisionId", "only the current draft revision can receive credits");
            }
            // Lock in UUID order so concurrent contributor edits and assignments serialize.
            Map<UUID, JsonNode> people = new java.util.HashMap<>();
            requested.stream().map(Credit::id).distinct().sorted().forEach(id -> {
                JsonNode person = contributor(id, true);
                if (!"ACTIVE".equals(person.path("status").asString())) {
                    throw conflict("/contributors", "archived contributors cannot receive new assignments");
                }
                people.put(id, person);
            });
            jdbc.update("DELETE FROM article_contributor WHERE article_revision_id = ?", revision);
            List<Map<String, Object>> responseCredits = new ArrayList<>();
            for (int index = 0; index < requested.size(); index++) {
                Credit credit = requested.get(index);
                jdbc.update("INSERT INTO article_contributor (article_revision_id, contributor_id, role, position) VALUES (?, ?, ?, ?)",
                        revision, credit.id(), credit.role(), index + 1);
                JsonNode person = people.get(credit.id());
                responseCredits.add(Map.of("contributorId", credit.id().toString(), "slug", person.path("slug").asString(),
                        "displayName", person.path("displayName").asString(), "role", credit.role()));
            }
            jdbc.update("UPDATE article SET version = version + 1, updated_at = transaction_timestamp() WHERE id = ?", article);
            jdbc.update("UPDATE article_revision SET version = version + 1, updated_at = transaction_timestamp() WHERE id = ?", revision);
            audit.append(new AuditEventDraft(actor, "ARTICLE_CONTRIBUTORS_UPDATED", "ARTICLE", article,
                    Map.of("revisionId", revision, "version", version.value() + 1, "creditCount", requested.size())));
            return json.valueToTree(Map.of("articleId", article.toString(), "revisionId", revision.toString(),
                    "version", version.value() + 1, "contributors", responseCredits));
        });
    }

    private JsonNode execute(ActorContext actor, String operation, String key, String request, Supplier<JsonNode> work) {
        if (key == null || key.isBlank() || key.length() > 128 || key.codePoints().anyMatch(Character::isISOControl)) {
            throw invalid("/Idempotency-Key", "a bounded idempotency key is required");
        }
        String hash = sha256(request);
        return Objects.requireNonNull(transactions.execute(transaction -> {
            jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> { },
                    actor.subject() + ":CONTRIBUTOR:" + operation + ":" + key);
            List<Map<String, Object>> receipts = jdbc.queryForList("""
                    SELECT request_hash, response::text FROM contributor_command_receipt
                    WHERE actor_subject = ? AND operation = ? AND idempotency_key = ?
                    """, actor.subject(), operation, key);
            if (!receipts.isEmpty()) {
                Map<String, Object> receipt = receipts.getFirst();
                if (!hash.equals(receipt.get("request_hash"))) {
                    throw conflict("/Idempotency-Key", "idempotency key is already bound to another request");
                }
                return json.readTree((String) receipt.get("response"));
            }
            JsonNode result = work.get();
            jdbc.update("INSERT INTO contributor_command_receipt (actor_subject, operation, idempotency_key, request_hash, response) VALUES (?, ?, ?, ?, ?::jsonb)",
                    actor.subject(), operation, key, hash, result.toString());
            // Read the canonical database JSON for both the first response and retries.
            return json.readTree(jdbc.queryForObject("SELECT response::text FROM contributor_command_receipt WHERE actor_subject = ? AND operation = ? AND idempotency_key = ?",
                    String.class, actor.subject(), operation, key));
        }));
    }

    private JsonNode contributor(UUID id, boolean lock) {
        List<JsonNode> rows = jdbc.query("SELECT id, slug, display_name, status, version FROM contributor WHERE id = ?" + (lock ? " FOR UPDATE" : ""),
                (rs, row) -> json.valueToTree(Map.of("contributorId", rs.getString("id"), "slug", rs.getString("slug"),
                        "displayName", rs.getString("display_name"), "status", rs.getString("status"), "version", rs.getLong("version"))), id);
        if (rows.isEmpty()) {
            throw EditorialProblemException.notFound("/contributorId", "contributor was not found");
        }
        return rows.getFirst();
    }

    private static void fields(JsonNode command, Set<String> allowed) {
        if (command == null || !command.isObject()) {
            throw invalid("/", "request body must be an object");
        }
        for (var entry : command.properties()) {
            String field = entry.getKey();
            if (!allowed.contains(field)) {
                throw invalid("/" + field, "field is not supported");
            }
        }
    }

    private static String text(JsonNode command, String field, int max) {
        JsonNode value = command.get(field);
        if (value == null || !value.isString() || value.asString().isBlank() || value.asString().length() > max
                || value.asString().codePoints().anyMatch(Character::isISOControl)) {
            throw invalid("/" + field, "value must be bounded non-empty text without control characters");
        }
        return value.asString().strip();
    }

    private static void editor(ActorContext actor) {
        if (!actor.hasRole(RoleCode.EDITOR)) {
            throw EditorialProblemException.forbidden("/roles", "operation requires EDITOR role");
        }
    }

    private static void checkVersion(Version expected, long actual) {
        if (expected.value() != actual) {
            throw new VersionConflictException(expected, new Version(actual));
        }
    }

    private static EditorialProblemException invalid(String path, String detail) {
        return EditorialProblemException.invalid(path, "INVALID_REQUEST", detail);
    }

    private static EditorialProblemException conflict(String path, String detail) {
        return new EditorialProblemException(ProblemCode.VERSION_CONFLICT,
                List.of(new tw.basketball.magazine.shared.FieldError(path, "VERSION_CONFLICT", detail)));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private record Credit(UUID id, String role) { }
}
