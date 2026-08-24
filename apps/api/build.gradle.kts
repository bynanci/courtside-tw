import org.gradle.language.jvm.tasks.ProcessResources

plugins {
    java
    checkstyle
    id("org.springframework.boot") version "4.1.1"
    id("com.github.spotbugs") version "6.5.11"
}

group = "tw.basketball"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web:4.1.1")
    implementation("org.springframework.boot:spring-boot-starter-jdbc:4.1.1")
    implementation("org.springframework.boot:spring-boot-starter-actuator:4.1.1")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server:4.1.1")
    implementation("org.springframework.boot:spring-boot-micrometer-tracing-opentelemetry:4.1.1")
    implementation("com.networknt:json-schema-validator:3.0.7")
    runtimeOnly("org.postgresql:postgresql:42.7.13")
    testImplementation("org.springframework.boot:spring-boot-starter-test:4.1.1")
    testImplementation("com.tngtech.archunit:archunit-junit5:1.5.0")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter:2.0.5")
    testImplementation("org.testcontainers:testcontainers-postgresql:2.0.5")
}

tasks.withType<Test> {
    useJUnitPlatform()
    // Keep the repository's Testcontainers integration proofs in the CI test
    // graph; Gradle's default patterns do not discover *IT classes.
    include("**/*Test.class")
    include("**/*Tests.class")
    include("**/*TestCase.class")
    include("**/*IT.class")
    systemProperty("courtside.repoRoot", projectDir.resolve("../..").canonicalPath)
}

tasks.named<ProcessResources>("processResources") {
    from(projectDir.resolve("../../contracts/content-document.schema.json")) {
        into("contracts")
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.addAll(listOf("-Xlint:all", "-Werror"))
}

checkstyle {
    toolVersion = "13.9.0"
    configFile = file("$projectDir/config/checkstyle/checkstyle.xml")
    isIgnoreFailures = false
}

tasks.withType<Checkstyle>().configureEach {
    isIgnoreFailures = false
}

spotbugs {
    effort.set(com.github.spotbugs.snom.Effort.MAX)
    reportLevel.set(com.github.spotbugs.snom.Confidence.LOW)
    excludeFilter = file("$projectDir/config/spotbugs/exclude.xml")
    ignoreFailures = false
}

tasks.withType<com.github.spotbugs.snom.SpotBugsTask>().configureEach {
    ignoreFailures = false
}
