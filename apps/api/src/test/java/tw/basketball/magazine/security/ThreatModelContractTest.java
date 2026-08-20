package tw.basketball.magazine.security;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

final class ThreatModelContractTest {
    @Test
    void threatModelNamesTheT080P1BoundariesAndRequiredEvidence() throws Exception {
        Path repoRoot = Path.of(System.getProperty("courtside.repoRoot"));
        String document = Files.readString(repoRoot.resolve("docs/security/threat-model.md"));

        for (String required : new String[] {
                "T080",
                "content",
                "OIDC",
                "CSRF",
                "upload",
                "SSRF",
                "embed",
                "p5",
                "authorization",
                "dependencies",
                "provider",
                "SIWE",
                "signer",
                "exact-head",
                "zero unresolved threads"
        }) {
            assertTrue(document.toLowerCase().contains(required.toLowerCase()),
                    "missing threat-model contract: " + required);
        }

        assertTrue(document.contains("T081"), "the sequencing boundary must remain explicit");
        assertTrue(document.contains("T087"), "the Web3 boundary must remain explicit");
    }
}
