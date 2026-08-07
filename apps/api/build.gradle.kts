plugins {
    java
    id("org.springframework.boot") version "4.1.0"
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
}

tasks.withType<Test> {
    useJUnitPlatform()
}
