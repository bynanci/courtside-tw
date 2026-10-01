package tw.basketball.magazine.provenance;

import java.time.Clock;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.core.env.Environment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;
import tw.basketball.magazine.outbox.OutboxHandlerException;
import tw.basketball.magazine.outbox.OutboxHandlerRegistration;
import tw.basketball.magazine.provenance.application.ProvenanceService;
import tw.basketball.magazine.provenance.application.ProvenanceExternalPublisher;
import tw.basketball.magazine.provenance.chain.ManagedAttestationWorker;
import tw.basketball.magazine.provenance.chain.ManagedSignerHttpAdapter;
import tw.basketball.magazine.provenance.ipfs.KuboHttpMirrorAdapter;
import tw.basketball.magazine.provenance.ipfs.VerifiedMirror;
import tw.basketball.magazine.provenance.transport.WorkerHttpTransport;

@Configuration(proxyBeanMethods = false)
@Profile("worker")
@ConditionalOnProperty(prefix = "courtside.outbox", name = "enabled", havingValue = "true")
@ConditionalOnBean({JdbcTemplate.class, PlatformTransactionManager.class})
public final class ProvenanceConfiguration {
    @Bean
    public OutboxHandlerRegistration provenanceHandler(JdbcTemplate jdbc, PlatformTransactionManager manager,
            ObjectMapper json, Environment environment) {
        ProvenanceService service = new ProvenanceService(jdbc, new TransactionTemplate(manager), json, Clock.systemUTC());
        ProvenanceExternalPublisher publisher = externalPublisher(environment, json);
        return new OutboxHandlerRegistration("provenance.snapshot", event -> {
            if (!"PUBLICATION_SNAPSHOT".equals(event.aggregateType())) {
                throw new OutboxHandlerException("invalid provenance aggregate", false);
            }
            UUID snapshotId;
            try {
                snapshotId = UUID.fromString(json.readTree(event.payloadJson()).path("snapshotId").asString());
                if (!snapshotId.equals(event.aggregateId())) {
                    throw new IllegalArgumentException("snapshot does not match aggregate");
                }
            } catch (RuntimeException invalid) {
                throw new OutboxHandlerException("invalid provenance event", invalid, false);
            }
            try {
                service.project(snapshotId);
                if (!service.deliverExternal(snapshotId, publisher)) {
                    throw new OutboxHandlerException("provenance confirmation pending", true);
                }
            } catch (IllegalArgumentException | IllegalStateException invalid) {
                throw new OutboxHandlerException("invalid provenance projection", invalid, false);
            }
        });
    }
    private static ProvenanceExternalPublisher externalPublisher(Environment environment, ObjectMapper json) {
        boolean ipfsEnabled = environment.getProperty("courtside.web3.ipfs-enabled", Boolean.class, false);
        boolean chainEnabled = environment.getProperty("courtside.web3.chain-enabled", Boolean.class, false);
        Optional<VerifiedMirror> mirror = Optional.empty();
        Optional<ManagedAttestationWorker> chain = Optional.empty();
        ManagedAttestationWorker.Policy policy = new ManagedAttestationWorker.Policy("", "", 0, 1);
        if (ipfsEnabled) {
            URI firstRpc = URI.create(environment.getRequiredProperty("courtside.web3.ipfs-first-rpc"));
            URI firstGateway = URI.create(environment.getRequiredProperty("courtside.web3.ipfs-first-gateway"));
            URI secondRpc = URI.create(environment.getRequiredProperty("courtside.web3.ipfs-second-rpc"));
            URI secondGateway = URI.create(environment.getRequiredProperty("courtside.web3.ipfs-second-gateway"));
            if (firstGateway.equals(secondGateway) || firstRpc.equals(secondRpc)) {
                throw new IllegalArgumentException("two distinct mirror routes are required");
            }
            WorkerHttpTransport http = new WorkerHttpTransport(Set.copyOf(List.of(firstRpc.getHost(), firstGateway.getHost(),
                    secondRpc.getHost(), secondGateway.getHost())), false);
            mirror = Optional.of(new VerifiedMirror(List.of(new KuboHttpMirrorAdapter(firstRpc, firstGateway, http, Map.of()),
                    new KuboHttpMirrorAdapter(secondRpc, secondGateway, http, Map.of())),
                    () -> environment.getProperty("courtside.web3.ipfs-enabled", Boolean.class, false)));
        }
        if (chainEnabled) {
            URI signer = URI.create(environment.getRequiredProperty("courtside.web3.signer-endpoint"));
            URI rpc = URI.create(environment.getRequiredProperty("courtside.web3.chain-rpc"));
            policy = new ManagedAttestationWorker.Policy(environment.getRequiredProperty("courtside.web3.network"),
                    environment.getRequiredProperty("courtside.web3.contract"),
                    environment.getProperty("courtside.web3.gas-ceiling", Long.class, 0L),
                    environment.getProperty("courtside.web3.confirmations", Long.class, 1L));
            if (policy.gasCeiling() == 0) {
                throw new IllegalArgumentException("chain write requires a positive approved gas ceiling");
            }
            WorkerHttpTransport http = new WorkerHttpTransport(Set.copyOf(List.of(signer.getHost(), rpc.getHost())), false);
            chain = Optional.of(new ManagedAttestationWorker(policy,
                    new ManagedSignerHttpAdapter(signer, rpc, http, json, policy, Map.of()),
                    () -> environment.getProperty("courtside.web3.chain-enabled", Boolean.class, false)));
        }
        return new ProvenanceExternalPublisher(mirror, chain, policy);
    }
}
