package tw.basketball.magazine.fanpassport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.transaction.PlatformTransactionManager;
import tw.basketball.magazine.fanpassport.api.FanPassportController;
import tw.basketball.magazine.fanpassport.identity.SiweIdentityService;
import tw.basketball.magazine.identity.application.AccountProblemException;
import tw.basketball.magazine.shared.ProblemCode;

final class WalletFeatureFlagTest {

  @Test
  void disabledWalletAndMissingApprovedChainRejectBeforeDatabaseResolution() {
    var providers = new StaticListableBeanFactory();
    var auth = new UsernamePasswordAuthenticationToken(
      "reader",
      "unused",
      List.of(new SimpleGrantedAuthority("ROLE_READER"))
    );
    var input = new SiweIdentityService.ChallengeRequest(
      "courtside.tw",
      "0x0000000000000000000000000000000000000001",
      "eip155:1",
      "https://courtside.tw"
    );
    for (MockEnvironment environment : List.of(
      new MockEnvironment(),
      new MockEnvironment().withProperty("COURTSIDE_WEB3_WALLET_ENABLED", "true")
    )) {
      var controller = new FanPassportController(
        providers.getBeanProvider(JdbcTemplate.class),
        providers.getBeanProvider(PlatformTransactionManager.class),
        environment
      );
      assertEquals(
        ProblemCode.FORBIDDEN,
        assertThrows(AccountProblemException.class, () ->
          controller.challenge(input, "flag-test", auth, new MockHttpServletRequest())
        ).problemCode()
      );
      assertEquals(
        ProblemCode.FORBIDDEN,
        assertThrows(AccountProblemException.class, () ->
          controller.verify(
            new SiweIdentityService.VerifyRequest("untrusted", "0x00"),
            "flag-test",
            auth,
            new MockHttpServletRequest()
          )
        ).problemCode()
      );
    }
  }
}
