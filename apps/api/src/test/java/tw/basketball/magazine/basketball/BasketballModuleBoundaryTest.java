package tw.basketball.magazine.basketball;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "tw.basketball.magazine", importOptions = ImportOption.DoNotIncludeTests.class)
final class BasketballModuleBoundaryTest {
    @ArchTest
    static final ArchRule domainIsIndependentOfProvidersAndTaxonomy = noClasses()
            .that().resideInAPackage("..basketball.domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "..taxonomy..", "..basketball.adapters..", "org.springframework..", "java.sql..", "java.net.http..");

    @ArchTest
    static final ArchRule adaptersHaveNoProductionWriteCapability = noClasses()
            .that().resideInAPackage("..basketball.adapters..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "..basketball.application..", "..basketball.persistence..", "java.sql..", "javax.sql..",
                    "java.net.http..", "org.springframework.jdbc..");
}
