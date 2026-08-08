import org.gradle.language.jvm.tasks.ProcessResources

plugins {
    java
    checkstyle
    id("org.springframework.boot") version "4.1.0"
    id("com.github.spotbugs") version "6.5.10"
}

group = "tw.basketball"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web:4.1.0")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server:4.1.0")
    implementation("com.networknt:json-schema-validator:1.5.9")
    testImplementation("org.springframework.boot:spring-boot-starter-test:4.1.0")
}

tasks.withType<Test> {
    useJUnitPlatform()
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
