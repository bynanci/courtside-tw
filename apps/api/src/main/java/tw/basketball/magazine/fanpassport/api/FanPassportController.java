package tw.basketball.magazine.fanpassport.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tw.basketball.magazine.fanpassport.application.FanPassportService;
import tw.basketball.magazine.fanpassport.identity.SiweIdentityService;
import tw.basketball.magazine.fanpassport.identity.Web3jWalletSignatureVerifier;
import tw.basketball.magazine.identity.application.AccountProblemException;
import tw.basketball.magazine.identity.application.AuthenticatedReader;
import tw.basketball.magazine.shared.ApplicationClock;
import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.RequestId;

/** Private passport and auxiliary wallet API; public article controllers have no dependency here. */
@RestController
public final class FanPassportController {

  private final ObjectProvider<JdbcTemplate> jdbc;
  private final ObjectProvider<PlatformTransactionManager> manager;
  private final Environment environment;
  private volatile Services services;

  public FanPassportController(
    ObjectProvider<JdbcTemplate> jdbc,
    ObjectProvider<PlatformTransactionManager> manager,
    Environment environment
  ) {
    this.jdbc = jdbc;
    this.manager = manager;
    this.environment = environment;
  }

  private synchronized Services services() {
    if (services == null) {
      JdbcTemplate database = jdbc.getIfAvailable();
      PlatformTransactionManager transactions = manager.getIfAvailable();
      if (database == null || transactions == null) {
        throw new IllegalStateException("passport persistence unavailable");
      }
      ApplicationClock clock = ApplicationClock.systemUtc();
      FanPassportService passport = new FanPassportService(database, transactions, clock);
      services = new Services(
        passport,
        new SiweIdentityService(
          database,
          transactions,
          passport,
          clock,
          new Web3jWalletSignatureVerifier(),
          environment.getProperty("COURTSIDE_SIWE_DOMAIN", "courtside.tw"),
          environment.getProperty("COURTSIDE_SIWE_URI", "https://courtside.tw"),
          environment.getProperty("COURTSIDE_SIWE_CHAIN_ID", "")
        )
      );
    }
    return services;
  }

  @GetMapping("/api/v1/me/passport")
  public ResponseEntity<?> list(Authentication auth, HttpServletRequest request) {
    AuthenticatedReader identity = reader(auth, "READER");
    return response(services().passport().list(identity), request);
  }

  @PostMapping(
    path = "/api/v1/me/passport/claims",
    consumes = "application/json",
    produces = "application/json"
  )
  public ResponseEntity<?> claim(
    @RequestBody Claim input,
    @RequestHeader("Idempotency-Key") String key,
    Authentication auth,
    HttpServletRequest request
  ) {
    AuthenticatedReader identity = reader(auth, "READER");
    return response(
      services().passport().claim(identity, input.issueId(), input.season(), key),
      request
    );
  }

  @PostMapping(
    path = "/api/v1/me/passport/{stampId}/credential",
    consumes = "application/json",
    produces = "application/json"
  )
  public ResponseEntity<?> credential(
    @PathVariable UUID stampId,
    @RequestBody Consent input,
    @RequestHeader("Idempotency-Key") String key,
    Authentication auth,
    HttpServletRequest request
  ) {
    AuthenticatedReader identity = reader(auth, "READER");
    FanPassportService.digestKey(key);
    return response(services().passport().credential(identity, stampId, input.consent()), request);
  }

  @PostMapping(
    path = "/api/v1/publisher/passport/{stampId}/status",
    consumes = "application/json",
    produces = "application/json"
  )
  public ResponseEntity<?> status(
    @PathVariable UUID stampId,
    @RequestBody StatusCommand input,
    @RequestHeader("If-Match") String version,
    Authentication auth,
    HttpServletRequest request
  ) {
    reader(auth, "PUBLISHER");
    if (!version.matches("\\\"[0-9]{1,18}\\\"")) {
      throw new IllegalArgumentException("quoted numeric stamp version required");
    }
    return response(
      services()
        .passport()
        .changeStatus(
          stampId,
          input.status(),
          input.reason(),
          Long.parseLong(version.substring(1, version.length() - 1))
        ),
      request
    );
  }

  @PostMapping(
    path = "/api/v1/auth/siwe/challenge",
    consumes = "application/json",
    produces = "application/json"
  )
  public ResponseEntity<?> challenge(
    @RequestBody SiweIdentityService.ChallengeRequest input,
    @RequestHeader("Idempotency-Key") String key,
    Authentication auth,
    HttpServletRequest request
  ) {
    AuthenticatedReader identity = reader(auth, "READER");
    requireWalletEnabled();
    return response(services().wallet().challenge(identity, input, key), request);
  }

  @PostMapping(
    path = "/api/v1/auth/siwe/verify",
    consumes = "application/json",
    produces = "application/json"
  )
  public ResponseEntity<?> verify(
    @RequestBody SiweIdentityService.VerifyRequest input,
    @RequestHeader("Idempotency-Key") String key,
    Authentication auth,
    HttpServletRequest request
  ) {
    AuthenticatedReader identity = reader(auth, "READER");
    requireWalletEnabled();
    return response(services().wallet().verify(identity, input, key), request);
  }

  @DeleteMapping("/api/v1/me/wallets/{chainNamespace}/{address}")
  public ResponseEntity<Void> unlink(
    @PathVariable String chainNamespace,
    @PathVariable String address,
    @RequestHeader("Idempotency-Key") String key,
    Authentication auth,
    HttpServletRequest request
  ) {
    AuthenticatedReader identity = reader(auth, "READER");
    services().wallet().unlink(identity, chainNamespace, address, key);
    return ResponseEntity.noContent().headers(response(null, request).getHeaders()).build();
  }

  private void requireWalletEnabled() {
    String configuredChain = environment.getProperty("COURTSIDE_SIWE_CHAIN_ID", "");
    if (
      !environment.getProperty("COURTSIDE_WEB3_WALLET_ENABLED", Boolean.class, false) ||
      !configuredChain.matches("eip155:[1-9][0-9]{0,17}")
    ) {
      throw AccountProblemException.forbidden(
        "wallet_link_disabled",
        "wallet linking is not enabled for an approved chain"
      );
    }
  }

  private static AuthenticatedReader reader(Authentication auth, String role) {
    if (auth == null || !auth.isAuthenticated()) {
      throw new AccountProblemException(ProblemCode.AUTHENTICATION_REQUIRED, List.of());
    }
    if (
      auth
        .getAuthorities()
        .stream()
        .noneMatch((authority) -> ("ROLE_" + role).equals(authority.getAuthority()))
    ) {
      throw AccountProblemException.forbidden("role_required", "required account role is missing");
    }
    // SIWE is not an authentication source. The resource-server supplies a validated OIDC principal.
    return AuthenticatedReader.from(auth);
  }

  private static ResponseEntity<?> response(Object body, HttpServletRequest request) {
    String id = request.getHeader("X-Request-Id");
    try {
      id = RequestId.of(id).value();
    } catch (IllegalArgumentException | NullPointerException ignored) {
      id = "req-" + UUID.randomUUID();
    }
    return ResponseEntity.ok()
      .cacheControl(CacheControl.noStore())
      .header("X-Request-Id", id)
      .header("X-Content-Type-Options", "nosniff")
      .body(body);
  }

  private record Services(FanPassportService passport, SiweIdentityService wallet) {}

  public record Claim(UUID issueId, String season) {}

  public record Consent(boolean consent) {}

  public record StatusCommand(String status, String reason) {}
}
