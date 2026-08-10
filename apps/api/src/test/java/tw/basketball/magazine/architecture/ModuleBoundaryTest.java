package tw.basketball.magazine.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(
        packages = "tw.basketball.magazine",
        importOptions = ImportOption.DoNotIncludeTests.class
)
final class ModuleBoundaryTest {
    @ArchTest
    static final ArchRule auditDoesNotDependOnFeatureModules = noClasses()
            .that().resideInAnyPackage("..audit..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "..content..",
                    "..identity..",
                    "..media..",
                    "..outbox..",
                    "..publication..",
                    "..provenance.."
            )
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule mediaDomainAndStorageDoNotDependOnAuditOrOutbox = noClasses()
            .that().resideInAnyPackage("..media.domain..", "..media.storage..")
            .should().dependOnClassesThat().resideInAnyPackage("..audit..", "..outbox..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule sharedDoesNotDependOnFeatureModules = noClasses()
            .that().resideInAnyPackage("..shared..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "..content..",
                    "..identity..",
                    "..media..",
                    "..outbox..",
                    "..publication..",
                    "..provenance.."
            );
}
