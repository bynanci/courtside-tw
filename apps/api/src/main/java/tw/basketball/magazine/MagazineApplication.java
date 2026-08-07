package tw.basketball.magazine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Shared entry point for the API and worker processes.
 *
 * <p>Runtime responsibilities are selected by the active Spring profile;
 * the application artifact and package boundary stay the same for both
 * processes.</p>
 */
@SpringBootApplication
public class MagazineApplication {

    public static void main(String[] args) {
        SpringApplication.run(MagazineApplication.class, args);
    }
}
