package tw.basketball.magazine.testsupport;

import java.net.URI;
import java.util.Objects;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Opt-in local integration environment for PostgreSQL, S3Mock and the OIDC stub. */
public final class CourtsideTestcontainers implements AutoCloseable {
    private static final String POSTGRES_IMAGE = "postgres:18.4-alpine";
    private static final String S3_IMAGE = "adobe/s3mock:3.12.0";
    private static final String OIDC_IMAGE = "ghcr.io/navikt/mock-oauth2-server:6.0.0";
    private static final int S3_PORT = 9090;
    private static final int OIDC_PORT = 8080;

    private final PostgreSQLContainer postgres;
    private final GenericContainer<?> s3;
    private final GenericContainer<?> oidc;
    private boolean started;

    public CourtsideTestcontainers() {
        postgres = new PostgreSQLContainer(POSTGRES_IMAGE)
                .withDatabaseName("courtside")
                .withUsername("courtside")
                .withPassword("courtside-test");
        s3 = new GenericContainer<>(DockerImageName.parse(S3_IMAGE))
                .withExposedPorts(S3_PORT);
        oidc = new GenericContainer<>(DockerImageName.parse(OIDC_IMAGE))
                .withEnv("SERVER_PORT", Integer.toString(OIDC_PORT))
                .withExposedPorts(OIDC_PORT);
    }

    public void start() {
        if (started) {
            return;
        }
        try {
            postgres.start();
            s3.start();
            oidc.start();
            started = true;
        } catch (RuntimeException exception) {
            close();
            throw exception;
        }
    }

    public String jdbcUrl() {
        requireStarted();
        return postgres.getJdbcUrl();
    }

    public String jdbcUsername() {
        requireStarted();
        return postgres.getUsername();
    }

    public String jdbcPassword() {
        requireStarted();
        return postgres.getPassword();
    }

    public S3EmulatorFixture s3Fixture() {
        requireStarted();
        return new S3EmulatorFixture(
                URI.create("http://" + s3.getHost() + ":" + s3.getMappedPort(S3_PORT)),
                "courtside-test",
                "media/originals/",
                "media/variants/"
        );
    }

    public URI oidcIssuer() {
        requireStarted();
        return URI.create("http://" + oidc.getHost() + ":" + oidc.getMappedPort(OIDC_PORT) + "/default");
    }

    @Override
    public void close() {
        if (oidc.isRunning()) {
            oidc.stop();
        }
        if (s3.isRunning()) {
            s3.stop();
        }
        if (postgres.isRunning()) {
            postgres.stop();
        }
        started = false;
    }

    private void requireStarted() {
        if (!started) {
            throw new IllegalStateException("Courtside testcontainers are not started");
        }
        Objects.requireNonNull(postgres, "postgres");
    }
}
