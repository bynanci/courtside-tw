package tw.basketball.magazine.fanpassport.recap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import tw.basketball.magazine.content.validation.ContentDocumentValidator;
import tw.basketball.magazine.fanpassport.archive.ArchiveContributionPolicy;
import tools.jackson.databind.ObjectMapper;

final class SeasonRecapProjectionTest {
    private static final Instant AS_OF = Instant.parse("2026-08-01T00:00:00Z");
    private static final UUID SEASON = id(817);

    @Test
    void projectsPublicEvidenceIntoAValidatedReproducibleContentBlock() {
        var projection = SeasonRecapProjectionService.project(request(), signals(), rights(), AS_OF);
        var repeated = SeasonRecapProjectionService.project(request(), signals().reversed(), rights(), AS_OF);
        assertEquals(projection, repeated);
        assertEquals(List.of(0.25, 0.5, 0.75), projection.values());
        assertEquals(List.of(id(819)), projection.evidenceSnapshotIds());
        var document = new ObjectMapper().valueToTree(projection.contentDocument(id(810), id(811), rights(), "PUBLIC_WEB", AS_OF));
        var validation = new ContentDocumentValidator().validate(document);
        assertTrue(validation.valid(), validation.errors().toString());
        assertFalse(document.toString().contains("readerId"));
        assertFalse(document.toString().contains("sourceUrl"));
        assertFalse(document.toString().contains("rightsContract"));
    }

    @Test
    void rejectsPrivateUnconfirmedStaleAndCrossSeasonSignals() {
        for (var signal : List.of(
                signal(1, 0.25, "PRIVATE", "CONFIRMED", "fresh", SEASON),
                signal(1, 0.25, "PUBLIC", "REPORTED", "fresh", SEASON),
                signal(1, 0.25, "PUBLIC", "CONFIRMED", "stale", SEASON),
                signal(1, 0.25, "PUBLIC", "CONFIRMED", "disputed", SEASON),
                signal(1, 0.25, "PUBLIC", "CONFIRMED", "fresh", id(999))
        )) {
            assertThrows(IllegalArgumentException.class, () ->
                    SeasonRecapProjectionService.project(request(), List.of(signal), rights(), AS_OF));
        }
    }

    @Test
    void refusesDuplicateOutOfRangeOrFutureSignals() {
        assertThrows(IllegalArgumentException.class, () ->
                SeasonRecapProjectionService.project(request(), List.of(signals().getFirst(), signals().getFirst()), rights(), AS_OF));
        assertThrows(IllegalArgumentException.class, () -> signal(1, Double.NaN, "PUBLIC", "CONFIRMED", "fresh", SEASON));
        assertThrows(IllegalArgumentException.class, () -> signal(1, 1.1, "PUBLIC", "CONFIRMED", "fresh", SEASON));
        assertThrows(IllegalArgumentException.class, () ->
                SeasonRecapProjectionService.project(request(), signals(), rights(), AS_OF.minusSeconds(1)));
    }

    @Test
    void withdrawalWinsForEveryChannelAndPreviouslyCreatedProjection() {
        var projection = SeasonRecapProjectionService.project(request(), signals(), rights(), AS_OF);
        var withdrawn = rights().withdraw(AS_OF.plusSeconds(1));
        for (String channel : List.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE", "IPFS")) {
            assertFalse(projection.mayPresent(withdrawn, channel, AS_OF.plusSeconds(1)));
            assertThrows(IllegalArgumentException.class, () ->
                    projection.contentDocument(id(810), id(811), withdrawn, channel, AS_OF.plusSeconds(1)));
        }
        assertThrows(IllegalArgumentException.class, () ->
                SeasonRecapProjectionService.project(request(), signals(), withdrawn, AS_OF.plusSeconds(1)));
        assertFalse(projection.mayPresent(rights(), "IPFS", AS_OF));
    }

    private static SeasonRecapProjectionService.Request request() {
        return new SeasonRecapProjectionService.Request(SEASON, id(818), id(816), 2026,
                "賽季公開資料的三段視覺摘要", "測試賽季公開訊號；資料截至 2026-08-01。", AS_OF);
    }

    private static List<SeasonRecapProjectionService.Signal> signals() {
        return List.of(signal(1, 0.25, "PUBLIC", "CONFIRMED", "fresh", SEASON),
                signal(2, 0.5, "PUBLIC", "CONFIRMED", "fresh", SEASON),
                signal(3, 0.75, "PUBLIC", "CONFIRMED", "fresh", SEASON));
    }

    private static SeasonRecapProjectionService.Signal signal(int ordinal, double value,
            String visibility, String status, String condition, UUID season) {
        return new SeasonRecapProjectionService.Signal(id(ordinal), season, id(819), ordinal,
                value, visibility, status, condition, AS_OF, AS_OF, true);
    }

    private static ArchiveContributionPolicy.Rights rights() {
        return new ArchiveContributionPolicy.Rights(id(816), "Fixture owner", "Fixture license",
                Set.of("PUBLIC_WEB", "CACHE", "SEARCH", "OFFLINE"), false, false,
                AS_OF.minusSeconds(60), AS_OF.plusSeconds(86400), "Fixture credit",
                "ORIGIN_WITHDRAWAL", null);
    }

    private static UUID id(int value) {
        return UUID.fromString("00000000-0000-4000-8000-" + String.format("%012d", value));
    }
}
