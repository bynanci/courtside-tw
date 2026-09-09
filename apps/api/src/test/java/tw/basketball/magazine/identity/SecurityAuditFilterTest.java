package tw.basketball.magazine.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import tw.basketball.magazine.audit.AuditEventDraft;
import tw.basketball.magazine.audit.AuditWriter;

@org.springframework.boot.test.context.SpringBootTest(
        classes = {tw.basketball.magazine.MagazineApplication.class, SecurityAuditFilterTest.AuditTestConfiguration.class},
        properties = {"spring.profiles.active=api", "courtside.security.oidc.issuer=https://audit.example.test",
                "courtside.security.oidc.audience=courtside-api", "courtside.security.oidc.jwk-set-uri=https://audit.example.test/keys"})
@org.springframework.test.context.web.WebAppConfiguration
class SecurityAuditFilterTest {
    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.web.context.WebApplicationContext context;

    @org.springframework.beans.factory.annotation.Autowired
    private CapturingAuditWriter captured;

    @Test
    void actualChainAuditsCsrfBearerAndMethodDenialsWithOneResponseRequestId() throws Exception {
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean(org.springframework.security.web.FilterChainProxy.class)).build();
        captured.events.clear();
        // No bearer and no CSRF token: CsrfFilter rejects before authentication.
        var csrf = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/editor/audit-probe"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden())
                .andReturn().getResponse();
        assertEquals(1, captured.events.size());
        assertEquals(csrf.getHeader("X-Request-Id"), captured.events.getLast().actor().requestId().value());
        // Canonical converter rejects malformed authority claims during bearer authentication.
        var invalid = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/editor/audit-probe")
                        .header("Authorization", "Bearer INVALID"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized())
                .andReturn().getResponse();
        assertEquals(2, captured.events.size());
        assertEquals(invalid.getHeader("X-Request-Id"), captured.events.getLast().actor().requestId().value());
        // The route permits EDITOR; a real method-security denial is audited too.
        var denied = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/editor/audit-probe")
                        .header("Authorization", "Bearer EDITOR"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden())
                .andReturn().getResponse();
        assertEquals(3, captured.events.size());
        assertEquals(denied.getHeader("X-Request-Id"), captured.events.getLast().actor().requestId().value());
    }

    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods = false)
    static class AuditTestConfiguration {
        @org.springframework.context.annotation.Bean
        CapturingAuditWriter captureAudit() { return new CapturingAuditWriter(); }

        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        org.springframework.security.oauth2.jwt.JwtDecoder auditDecoder() {
            return value -> {
                java.time.Instant now = java.time.Instant.now();
                return org.springframework.security.oauth2.jwt.Jwt.withTokenValue(value).header("alg", "RS256")
                        .issuer("https://audit.example.test").subject("private-identity-canary")
                        .issuedAt(now.minusSeconds(10)).expiresAt(now.plusSeconds(60))
                        .claim("roles", List.of(value.equals("INVALID") ? "NOT_A_ROLE" : "EDITOR")).build();
            };
        }

        @org.springframework.context.annotation.Bean
        AuditProbe auditProbe() { return new AuditProbe(); }
    }

    static final class CapturingAuditWriter implements AuditWriter {
        final List<AuditEventDraft> events = new java.util.concurrent.CopyOnWriteArrayList<>();
        @Override
        public java.util.UUID append(AuditEventDraft event) {
            events.add(event);
            return java.util.UUID.randomUUID();
        }
    }

    @org.springframework.boot.test.context.TestComponent
    @org.springframework.web.bind.annotation.RestController
    static class AuditProbe {
        @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('ROLE_PUBLISHER')")
        @org.springframework.web.bind.annotation.GetMapping("/api/v1/editor/audit-probe")
        public String probe() { return "should not enter"; }
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void bearerFailureAndMethodDenialAppendOnceWithoutTokenPathOrBody() throws Exception {
        for (int denied : new int[] {401, 403}) {
            List<AuditEventDraft> events = new ArrayList<>();
            AuditWriter writer = draft -> { events.add(draft); return java.util.UUID.randomUUID(); };
            SecurityAuditFilter filter = new SecurityAuditFilter(writer, null, SecurityAuditFilter.Stage.BOUNDARY);
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/editor/articles/private-secret");
            request.addHeader("Authorization", "Bearer private-token-canary");
            request.setQueryString("token=private-query-canary");
            request.setContent("private-body-canary".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            request.addHeader("X-Request-Id", "audit-denied-" + denied);
            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> response.setStatus(denied));
            assertEquals(1, events.size());
            AuditEventDraft event = events.getFirst();
            assertEquals("PERMISSION_DENIED", event.action());
            assertEquals(denied, event.metadata().get("status"));
            assertEquals("EDITOR", event.metadata().get("boundary"));
            assertEquals("audit-denied-" + denied, event.actor().requestId().value());
            assertFalse(event.toString().contains("private-"));
        }
    }

    @Test
    void successfulAnonymousReadingAndRateLimitDoNotEmitPermissionFailure() throws Exception {
        AuditWriter writer = mock(AuditWriter.class);
        for (int status : new int[] {200, 429}) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            new SecurityAuditFilter(writer, null, SecurityAuditFilter.Stage.BOUNDARY)
                    .doFilter(new MockHttpServletRequest("GET", "/api/v1/public/issues"), response,
                            (req, res) -> response.setStatus(status));
        }
        verify(writer, times(0)).append(any());
    }

    @Test
    void auditStorageFailureIsNotReportedAsARecordedDenial() {
        AuditWriter writer = mock(AuditWriter.class);
        doThrow(new IllegalStateException("audit unavailable")).when(writer).append(any());
        SecurityAuditFilter filter = new SecurityAuditFilter(writer, null, SecurityAuditFilter.Stage.BOUNDARY);
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThrows(IllegalStateException.class, () -> filter.doFilter(
                new MockHttpServletRequest("POST", "/api/v1/editor/articles"), response,
                (req, res) -> response.setStatus(403)));
    }
}
