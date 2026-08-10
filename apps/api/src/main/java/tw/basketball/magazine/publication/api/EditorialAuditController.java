package tw.basketball.magazine.publication.api;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.publication.application.EditorialProblemException;
import tw.basketball.magazine.shared.ActorContext;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/** Read-only Studio audit query; the underlying audit table remains append-only. */
@RestController
@ConditionalOnBean(JdbcTemplate.class)
public final class EditorialAuditController {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public EditorialAuditController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping(path = "/api/v1/editor/audit", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> listAudit(
            @RequestParam String targetType,
            @RequestParam UUID targetId,
            @RequestParam(defaultValue = "50") int limit,
            Authentication authentication,
            HttpServletRequest request
    ) {
        ActorContext actor = actor(authentication, request);
        String normalizedTargetType = targetType == null ? "" : targetType.strip().toUpperCase();
        if (!Set.of("ARTICLE", "ISSUE", "MEDIA_ASSET").contains(normalizedTargetType)) {
            throw new IllegalArgumentException("targetType is not supported");
        }
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        List<Map<String, Object>> items = jdbcTemplate.query("""
                SELECT id, occurred_at, actor_subject, action, target_type,
                       target_id, request_id, metadata
                FROM audit_event
                WHERE target_type = ? AND target_id = ?
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?
                """, (resultSet, rowNumber) -> {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("id", resultSet.getString("id"));
            event.put("occurredAt", resultSet.getTimestamp("occurred_at").toInstant());
            event.put("actorSubject", resultSet.getString("actor_subject"));
            event.put("action", resultSet.getString("action"));
            event.put("targetType", resultSet.getString("target_type"));
            event.put("targetId", resultSet.getString("target_id"));
            event.put("requestId", resultSet.getString("request_id"));
            try {
                event.put("metadata", objectMapper.readTree(resultSet.getString("metadata")));
            } catch (Exception exception) {
                throw new IllegalStateException("audit metadata is not valid JSON", exception);
            }
            return event;
        }, normalizedTargetType, targetId, boundedLimit);
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("nextCursor", null);
        page.put("limit", boundedLimit);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("page", page);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header(REQUEST_ID_HEADER, requestId(request).value())
                .body(json(response));
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("unable to serialize audit response", exception);
        }
    }

    private static ActorContext actor(Authentication authentication, HttpServletRequest request) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new EditorialProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
        }
        Set<RoleCode> roles = new LinkedHashSet<>();
        authentication.getAuthorities().forEach(authority -> {
            String value = authority.getAuthority();
            if (value != null && value.startsWith("ROLE_")) {
                try {
                    roles.add(RoleCode.valueOf(value.substring("ROLE_".length())));
                } catch (IllegalArgumentException ignored) {
                    // Unknown authorities do not widen this read boundary.
                }
            }
        });
        if (!roles.contains(RoleCode.EDITOR) && !roles.contains(RoleCode.PUBLISHER)) {
            throw EditorialProblemException.forbidden("/roles", "operation requires EDITOR or PUBLISHER role");
        }
        return ActorContext.user(authentication.getName(), roles, requestId(request));
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Invalid caller input is not echoed.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }
}
