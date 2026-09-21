package tw.basketball.magazine.basketball;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.SpecificationVersion;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

final class BasketballContractTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void syntheticDomainAndEvidenceFixturesMatchStrictCanonicalContracts() throws Exception {
        for (String[] pair : new String[][] {
                {"basketball-domain", "basketball/synthetic-history.json"},
                {"evidence", "evidence/synthetic-conflict.json"}
        }) {
            Schema schema = schema(pair[0]);
            try (InputStream stream = getClass().getResourceAsStream("/" + pair[1])) {
                var document = JSON.readTree(stream);
                assertTrue(document.get("synthetic").asBoolean(), "fixtures must not masquerade as source facts");
                assertTrue(schema.validate(document).isEmpty(), () -> schema.validate(document).toString());
                var modified = document.deepCopy();
                ((tools.jackson.databind.node.ObjectNode) modified).put("undocumentedField", true);
                assertFalse(schema.validate(modified).isEmpty(), "contract rejects unreviewed fields");
            }
        }
    }

    @Test
    void confirmedClaimCannotHaveUnknownEffectiveTimeOrMissingSnapshot() throws Exception {
        Schema schema = schema("evidence");
        try (InputStream stream = getClass().getResourceAsStream("/evidence/synthetic-conflict.json")) {
            var document = JSON.readTree(stream);
            var reference = (tools.jackson.databind.node.ObjectNode) document.get("references").get(0);
            reference.put("status", "CONFIRMED");
            reference.put("effectiveAt", "UNKNOWN");
            assertFalse(schema.validate(document).isEmpty());
            reference.put("effectiveAt", "2026-01-01T00:00:00Z");
            reference.remove("snapshotId");
            assertFalse(schema.validate(document).isEmpty());
        }
    }

    private static Schema schema(String name) throws Exception {
        Path root = Path.of(System.getProperty("courtside.repoRoot", "../.."));
        SchemaRegistry registry = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12,
                builder -> builder.schemaRegistryConfig(SchemaRegistryConfig.builder().formatAssertionsEnabled(true).build()));
        try (InputStream stream = Files.newInputStream(root.resolve("contracts/" + name + ".schema.json"))) {
            return registry.getSchema(stream);
        }
    }
}
