package tw.basketball.magazine.identity;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.web.SecurityFilterChain;

@SpringBootTest(properties = {
        "spring.profiles.active=worker",
        "spring.main.web-application-type=none",
        "courtside.security.oidc.issuer=https://issuer.example.test",
        "courtside.security.oidc.audience=courtside-api",
        "courtside.security.oidc.jwk-set-uri=https://issuer.example.test/keys"
})
final class OidcWorkerSecurityConditionTest {
    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void doesNotCreateServletSecurityChainForWorkerProfile() {
        assertTrue(applicationContext.getBeansOfType(SecurityFilterChain.class).isEmpty());
    }
}
