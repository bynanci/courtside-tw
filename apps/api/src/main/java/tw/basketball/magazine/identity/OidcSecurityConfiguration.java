package tw.basketball.magazine.identity;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.util.matcher.RequestMatcher;

import tw.basketball.magazine.shared.ProblemCode;
import tw.basketball.magazine.shared.ProblemDetails;
import tw.basketball.magazine.shared.ProblemDetailsMapper;
import tw.basketball.magazine.shared.RequestId;
import tw.basketball.magazine.shared.RoleCode;

/**
 * Resource-server-only security foundation.
 *
 * <p>The configuration is limited to servlet API runtimes. A configured
 * provider uses an explicit JWKS endpoint, so metadata discovery cannot make
 * anonymous published content unavailable during provider outage. The
 * unconfigured servlet runtime keeps public routes anonymous and denies all
 * protected routes until an issuer is explicitly configured.</p>
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableMethodSecurity
@EnableConfigurationProperties(OidcSecurityProperties.class)
public final class OidcSecurityConfiguration {
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final RequestMatcher BEARER_TOKEN_REQUEST = OidcSecurityConfiguration::hasBearerToken;

    @Bean
    @ConditionalOnProperty(prefix = "courtside.security.oidc", name = "issuer")
    public JwtDecoder oidcJwtDecoder(OidcSecurityProperties properties) {
        String issuer = properties.requireIssuer();
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(properties.requireJwkSetUri())
                .build();
        decoder.setJwtValidator(tokenValidator(issuer, properties.requireAudience()));
        return decoder;
    }

    @Bean
    @ConditionalOnProperty(prefix = "courtside.security.oidc", name = "issuer")
    public JwtAuthenticationConverter oidcJwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new OidcRoleConverter());
        return converter;
    }

    @Bean
    @ConditionalOnProperty(prefix = "courtside.security.oidc", name = "issuer")
    public SecurityFilterChain oidcResourceServerSecurityFilterChain(
            HttpSecurity http,
            JwtAuthenticationConverter converter,
            ObjectMapper objectMapper
    ) {
        try {
            AuthenticationEntryPoint authenticationEntryPoint =
                    problemDetailsAuthenticationEntryPoint(objectMapper);
            AccessDeniedHandler accessDeniedHandler = problemDetailsAccessDeniedHandler(objectMapper);
            http
                    .csrf(csrf -> csrf
                            .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                            .ignoringRequestMatchers(BEARER_TOKEN_REQUEST))
                    .sessionManagement(session -> session.sessionCreationPolicy(
                            SessionCreationPolicy.STATELESS
                    ))
                    .exceptionHandling(exceptions -> exceptions
                            .authenticationEntryPoint(authenticationEntryPoint)
                            .accessDeniedHandler(accessDeniedHandler))
                    .authorizeHttpRequests(authorize -> authorize
                            .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                            .requestMatchers(HttpMethod.GET, "/api/v1/public/**").permitAll()
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
                    .oauth2ResourceServer(oauth2 -> oauth2
                            .authenticationEntryPoint(authenticationEntryPoint)
                            .accessDeniedHandler(accessDeniedHandler)
                            .jwt(jwt -> jwt.jwtAuthenticationConverter(converter)));
            return http.build();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to build OIDC resource-server security chain", exception);
        }
    }

    /**
     * Prevents Spring Boot's default all-authenticated chain from changing local
     * anonymous-reading behavior when no OIDC issuer is configured.
     */
    @Bean
    @ConditionalOnMissingBean(JwtDecoder.class)
    public SecurityFilterChain unconfiguredSecurityFilterChain(
            HttpSecurity http,
            ObjectMapper objectMapper
    ) {
        try {
            http
                    .csrf(csrf -> csrf
                            .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                            .ignoringRequestMatchers(BEARER_TOKEN_REQUEST))
                    .sessionManagement(session -> session.sessionCreationPolicy(
                            SessionCreationPolicy.STATELESS
                    ))
                    .exceptionHandling(exceptions -> exceptions
                            .authenticationEntryPoint(
                                    problemDetailsAuthenticationEntryPoint(objectMapper))
                            .accessDeniedHandler(problemDetailsAccessDeniedHandler(objectMapper)))
                    .authorizeHttpRequests(authorize -> authorize
                            .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                            .requestMatchers(HttpMethod.GET, "/api/v1/public/**").permitAll()
                            .anyRequest().authenticated());
            return http.build();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to build unconfigured security chain", exception);
        }
    }

    static OAuth2TokenValidator<Jwt> tokenValidator(String issuer, String audience) {
        Objects.requireNonNull(issuer, "issuer");
        Objects.requireNonNull(audience, "audience");
        OAuth2TokenValidator<Jwt> issuerAndTime = JwtValidators.createDefaultWithIssuer(issuer);
        return new DelegatingOAuth2TokenValidator<>(
                issuerAndTime,
                audienceValidator(audience),
                requiredSubjectValidator(),
                requiredExpirationValidator()
        );
    }

    static AuthenticationEntryPoint problemDetailsAuthenticationEntryPoint(ObjectMapper objectMapper) {
        Objects.requireNonNull(objectMapper, "objectMapper");
        return (request, response, exception) ->
                writeProblem(objectMapper, request, response, ProblemCode.AUTHENTICATION_REQUIRED);
    }

    static AccessDeniedHandler problemDetailsAccessDeniedHandler(ObjectMapper objectMapper) {
        Objects.requireNonNull(objectMapper, "objectMapper");
        return (request, response, exception) ->
                writeProblem(objectMapper, request, response, ProblemCode.FORBIDDEN);
    }

    private static void writeProblem(
            ObjectMapper objectMapper,
            HttpServletRequest request,
            HttpServletResponse response,
            ProblemCode code
    ) throws IOException {
        RequestId requestId = requestId(request);
        String instance = request.getRequestURI();
        ProblemDetails problem = ProblemDetailsMapper.from(
                code,
                instance == null || instance.isBlank() ? "/" : instance,
                requestId,
                List.of()
        );
        response.setStatus(code.status());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader(REQUEST_ID_HEADER, requestId.value());
        objectMapper.writeValue(response.getOutputStream(), problem);
    }

    private static RequestId requestId(HttpServletRequest request) {
        String candidate = request.getHeader(REQUEST_ID_HEADER);
        if (candidate != null && !candidate.isBlank()) {
            try {
                return RequestId.of(candidate);
            } catch (IllegalArgumentException ignored) {
                // Do not echo an untrusted or malformed correlation header.
            }
        }
        return RequestId.of("req-" + UUID.randomUUID());
    }

    private static boolean hasBearerToken(HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        return authorization != null && authorization.regionMatches(true, 0, "Bearer ", 0, 7);
    }

    private static OAuth2TokenValidator<Jwt> audienceValidator(String audience) {
        OAuth2Error error = new OAuth2Error(
                "invalid_token",
                "The required OIDC audience is missing.",
                null
        );
        return jwt -> {
            var audiences = jwt.getAudience();
            return audiences != null && audiences.contains(audience)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(error);
        };
    }

    private static OAuth2TokenValidator<Jwt> requiredSubjectValidator() {
        OAuth2Error error = new OAuth2Error(
                "invalid_token",
                "The OIDC subject is missing or invalid.",
                null
        );
        return jwt -> {
            String subject = jwt.getSubject();
            return subject != null
                    && !subject.isBlank()
                    && subject.length() <= 512
                    && subject.codePoints().noneMatch(Character::isISOControl)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(error);
        };
    }

    private static OAuth2TokenValidator<Jwt> requiredExpirationValidator() {
        OAuth2Error error = new OAuth2Error(
                "invalid_token",
                "The OIDC expiration is required.",
                null
        );
        return jwt -> jwt.getExpiresAt() == null
                ? OAuth2TokenValidatorResult.failure(error)
                : OAuth2TokenValidatorResult.success();
    }
}
