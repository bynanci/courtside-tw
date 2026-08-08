package tw.basketball.magazine.identity;

import java.util.Objects;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

import tw.basketball.magazine.shared.RoleCode;

/**
 * Resource-server-only security foundation.
 *
 * <p>The configuration activates only when an issuer property is supplied.
 * Provider discovery and JWKS retrieval therefore occur only in an explicitly
 * configured runtime, never in tests or an unconfigured local boot.</p>
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
@ConditionalOnProperty(prefix = "courtside.security.oidc", name = "issuer")
@EnableConfigurationProperties(OidcSecurityProperties.class)
public class OidcSecurityConfiguration {
    @Bean
    public JwtDecoder oidcJwtDecoder(OidcSecurityProperties properties) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withIssuerLocation(properties.issuer())
                .build();
        decoder.setJwtValidator(tokenValidator(properties.issuer(), properties.audience()));
        return decoder;
    }

    @Bean
    public JwtAuthenticationConverter oidcJwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new OidcRoleConverter());
        return converter;
    }

    @Bean
    public SecurityFilterChain oidcResourceServerSecurityFilterChain(
            HttpSecurity http,
            JwtAuthenticationConverter converter
    ) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(
                        SessionCreationPolicy.STATELESS
                ))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/api/v1/public/**").permitAll()
                        .requestMatchers("/api/v1/me/**")
                        .hasAuthority(OidcRolePolicy.authority(RoleCode.READER))
                        .requestMatchers("/api/v1/editor/**")
                        .hasAuthority(OidcRolePolicy.authority(RoleCode.EDITOR))
                        .requestMatchers("/api/v1/publisher/**")
                        .hasAuthority(OidcRolePolicy.authority(RoleCode.PUBLISHER))
                        .requestMatchers("/api/v1/admin/**")
                        .hasAuthority(OidcRolePolicy.authority(RoleCode.ADMIN))
                        .anyRequest().denyAll()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt
                        .jwtAuthenticationConverter(converter)
                ));
        return http.build();
    }

    static OAuth2TokenValidator<Jwt> tokenValidator(String issuer, String audience) {
        Objects.requireNonNull(issuer, "issuer");
        Objects.requireNonNull(audience, "audience");
        OAuth2TokenValidator<Jwt> issuerAndTime = JwtValidators.createDefaultWithIssuer(issuer);
        return new DelegatingOAuth2TokenValidator<>(issuerAndTime, audienceValidator(audience));
    }

    private static OAuth2TokenValidator<Jwt> audienceValidator(String audience) {
        OAuth2Error error = new OAuth2Error(
                "invalid_token",
                "The required OIDC audience is missing.",
                null
        );
        return jwt -> jwt.getAudience().contains(audience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }
}
