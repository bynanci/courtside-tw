package tw.basketball.magazine.shared;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.type.classreading.CachingMetadataReaderFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.audit.AuditWriter;
import tw.basketball.magazine.content.api.EditorialContributorController;
import tw.basketball.magazine.content.application.EditorialContributorService;
import tw.basketball.magazine.identity.api.AccountApiExceptionHandler;
import tw.basketball.magazine.identity.api.AccountController;
import tw.basketball.magazine.identity.application.AccountDataService;
import tw.basketball.magazine.media.api.EditorialMediaController;
import tw.basketball.magazine.media.api.EditorialMediaMetadataController;
import tw.basketball.magazine.media.api.PublisherMediaController;
import tw.basketball.magazine.media.application.EditorialMediaMetadataService;
import tw.basketball.magazine.media.application.EditorialMediaService;
import tw.basketball.magazine.media.application.PublisherMediaService;
import tw.basketball.magazine.publication.api.EditorialApiExceptionHandler;
import tw.basketball.magazine.publication.api.EditorialArticleController;
import tw.basketball.magazine.publication.api.EditorialIssueController;
import tw.basketball.magazine.publication.application.EditorialIssueService;
import tw.basketball.magazine.publication.application.EditorialWorkflowService;
import tw.basketball.magazine.readerlibrary.api.ReaderLibraryApiExceptionHandler;
import tw.basketball.magazine.readerlibrary.api.ReaderLibraryController;
import tw.basketball.magazine.readerlibrary.application.ReaderLibraryService;
import tw.basketball.magazine.taxonomy.api.EditorialTaxonomyController;
import tw.basketball.magazine.taxonomy.api.TaxonomyApiExceptionHandler;
import tw.basketball.magazine.taxonomy.application.TaxonomyService;

/** Every implemented write mapping passes through actual MVC adapters; no service may run on invalid input. */
final class WriteApiContractTest {
    private static final String ID = "00000000-0000-4000-8000-000000000001";
    private static final String CANARY = "credential-do-not-reflect";
    private static final List<Class<?>> CONTROLLERS = List.of(
            EditorialArticleController.class, EditorialIssueController.class,
            EditorialMediaController.class, EditorialMediaMetadataController.class,
            PublisherMediaController.class, EditorialTaxonomyController.class,
            EditorialContributorController.class, ReaderLibraryController.class, AccountController.class
    );
    private final List<Object> services = new ArrayList<>();
    private MockMvc mockMvc;

    @BeforeEach
    void installActualControllersAndAdvice() {
        StaticListableBeanFactory providers = new StaticListableBeanFactory();
        providers.addBean("readerLibraryService", service(ReaderLibraryService.class));
        providers.addBean("accountDataService", service(AccountDataService.class));
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new EditorialArticleController(service(EditorialWorkflowService.class)),
                        new EditorialIssueController(service(EditorialIssueService.class)),
                        new EditorialMediaController(service(EditorialMediaService.class)),
                        new EditorialMediaMetadataController(service(EditorialMediaMetadataService.class)),
                        new PublisherMediaController(service(PublisherMediaService.class)),
                        new EditorialTaxonomyController(service(TaxonomyService.class)),
                        new EditorialContributorController(service(EditorialContributorService.class)),
                        new ReaderLibraryController(
                                providers.getBeanProvider(ReaderLibraryService.class),
                                providers.getBeanProvider(JdbcTemplate.class),
                                providers.getBeanProvider(PlatformTransactionManager.class)),
                        new AccountController(
                                providers.getBeanProvider(AccountDataService.class),
                                providers.getBeanProvider(JdbcTemplate.class),
                                providers.getBeanProvider(PlatformTransactionManager.class),
                                providers.getBeanProvider(AuditWriter.class),
                                providers.getBeanProvider(ObjectMapper.class)))
                .setControllerAdvice(new ApiExceptionHandler(), new EditorialApiExceptionHandler(),
                        new TaxonomyApiExceptionHandler(), new ReaderLibraryApiExceptionHandler(),
                        new AccountApiExceptionHandler())
                .build();
    }

    @Test
    void matrixCoversEveryImplementedWriteControllerAndExcludesUnimplementedWalletContracts() throws Exception {
        var resolver = new PathMatchingResourcePatternResolver();
        var readers = new CachingMetadataReaderFactory(resolver);
        Set<String> actual = new HashSet<>();
        for (var resource : resolver.getResources("classpath*:tw/basketball/magazine/**/*.class")) {
            var metadata = readers.getMetadataReader(resource).getAnnotationMetadata();
            String name = metadata.getClassName();
            // Read metadata directly: component scanning would omit @ConditionalOnBean controllers
            // in this isolated MVC fixture, silently shrinking the tested route inventory.
            if (!name.contains("$") && metadata.hasAnnotation(RestController.class.getName()) && hasWriteMapping(name)) {
                actual.add(name);
            }
        }
        assertEquals(CONTROLLERS.stream().map(Class::getName).collect(Collectors.toSet()), actual,
                "New write controllers must join the executable matrix");
        assertFalse(endpoints().anyMatch(endpoint -> endpoint.path().contains("siwe")
                || endpoint.path().contains("wallet")), "US7 is contract-only, never claimed as HTTP coverage");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("endpoints")
    void unauthenticatedWritesReturnTheFullStableProblemAndMatchingRequestId(Endpoint endpoint) throws Exception {
        for (String candidate : List.of("contract-request.123", "invalid request " + CANARY, "")) {
            var builder = request(endpoint.method(), endpoint.url())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}")
                    .header("Idempotency-Key", "contract-no-service")
                    .header("If-Match", "\"0\"");
            if (!candidate.isEmpty()) {
                builder.header("X-Request-Id", candidate);
            }
            MvcResult result = mockMvc.perform(builder)
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                    .andExpect(jsonPath("$.type").value(ProblemCode.AUTHENTICATION_REQUIRED.type()))
                    .andExpect(jsonPath("$.title").value(ProblemCode.AUTHENTICATION_REQUIRED.title()))
                    .andExpect(jsonPath("$.status").value(401))
                    .andExpect(jsonPath("$.detail").value(ProblemCode.AUTHENTICATION_REQUIRED.defaultDetail()))
                    .andExpect(jsonPath("$.instance").value(endpoint.url()))
                    .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
                    .andReturn();
            assertRequestId(result, candidate.equals("contract-request.123") ? candidate : null);
        }
        verifyNoInteractions(services.toArray());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("typedBodyEndpoints")
    void malformedJsonNeverFallsBackToSpringProblemOrLeaksSubmittedValues(Endpoint endpoint) throws Exception {
        MvcResult result = mockMvc.perform(request(endpoint.method(), endpoint.url())
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Request-Id", "contract-json-error")
                        .content("{\"password\":\"" + CANARY + "\",\"broken\":"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.instance").value(endpoint.url()))
                .andExpect(jsonPath("$.detail").value(ProblemCode.INVALID_REQUEST.defaultDetail()))
                .andReturn();
        assertRequestId(result, "contract-json-error");
        assertFalse(result.getResponse().getContentAsString().contains(CANARY));
        verifyNoInteractions(services.toArray());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("jsonOnlyEndpoints")
    void unsupportedContentTypeUsesTheDocumentedInvalidRequestContract(Endpoint endpoint) throws Exception {
        MvcResult result = mockMvc.perform(request(endpoint.method(), endpoint.url())
                        .contentType(MediaType.APPLICATION_XML)
                        .header("X-Request-Id", "contract-media-error")
                        .content("<password>" + CANARY + "</password>"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.status").value(400))
                .andReturn();
        assertRequestId(result, "contract-media-error");
        assertFalse(result.getResponse().getContentAsString().contains(CANARY));
        verifyNoInteractions(services.toArray());
    }

    private <T> T service(Class<T> type) {
        T result = mock(type);
        services.add(result);
        return result;
    }

    private static void assertRequestId(MvcResult result, String expected) {
        String header = result.getResponse().getHeader("X-Request-Id");
        assertNotNull(header);
        RequestId.of(header);
        assertEquals(header, new ObjectMapper().readTree(result.getResponse().getContentAsByteArray())
                .path("requestId").asString());
        if (expected != null) {
            assertEquals(expected, header);
        }
        assertFalse(result.getResponse().getContentAsByteArray().length == 0);
        assertFalse(header.contains(CANARY));
    }

    static Stream<Endpoint> endpoints() {
        return CONTROLLERS.stream().flatMap(type -> Arrays.stream(type.getDeclaredMethods()))
                .flatMap(method -> {
                    RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
                    if (mapping == null) {
                        return Stream.empty();
                    }
                    boolean typedBody = Arrays.stream(method.getParameters()).anyMatch(parameter ->
                            parameter.isAnnotationPresent(RequestBody.class) && parameter.getType() != String.class);
                    return Arrays.stream(mapping.method())
                            .filter(value -> Set.of("POST", "PUT", "PATCH", "DELETE").contains(value.name()))
                            .flatMap(value -> Arrays.stream(mapping.path()).map(path -> new Endpoint(
                                    HttpMethod.valueOf(value.name()), path, typedBody,
                                    Arrays.asList(mapping.consumes()).contains(MediaType.APPLICATION_JSON_VALUE))));
                });
    }

    static Stream<Endpoint> typedBodyEndpoints() {
        return endpoints().filter(Endpoint::typedBody);
    }

    static Stream<Endpoint> jsonOnlyEndpoints() {
        return endpoints().filter(Endpoint::jsonOnly);
    }

    private static boolean hasWriteMapping(String className) {
        try {
            for (Method method : Class.forName(className).getDeclaredMethods()) {
                RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
                if (mapping != null && Arrays.stream(mapping.method()).anyMatch(value ->
                        Set.of("POST", "PUT", "PATCH", "DELETE").contains(value.name()))) {
                    return true;
                }
            }
            return false;
        } catch (ClassNotFoundException exception) {
            throw new IllegalStateException(exception);
        }
    }

    record Endpoint(HttpMethod method, String path, boolean typedBody, boolean jsonOnly) {
        String url() {
            return path.replaceAll("\\{[^}]+\\}", ID);
        }

        @Override
        public String toString() {
            return method + " " + path;
        }
    }
}
