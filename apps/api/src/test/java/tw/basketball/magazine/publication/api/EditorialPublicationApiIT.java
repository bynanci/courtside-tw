package tw.basketball.magazine.publication.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MvcResult;

import tw.basketball.magazine.editorial.EditorialApiIntegrationTestSupport;
import tw.basketball.magazine.publication.persistence.JdbcEditorialArticleRepository;
import tw.basketball.magazine.shared.RoleCode;

final class EditorialPublicationApiIT extends EditorialApiIntegrationTestSupport {
    private static final String CREATE_BODY = """
            {
              "title": "Opening night",
              "slug": "opening-night",
              "dek": "A fixture story",
              "content": {"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000001","blocks":[{"id":"00000000-0000-4000-8000-000000000101","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Opening night fixture"}]}}]}
            }
            """;

    @Test
    void editorCanCreateAndConditionallyPatchButStaleIfMatchCannotOverwrite() throws Exception {
        var editor = actor("editor-1", RoleCode.EDITOR);
        CreatedArticle article = createArticle(editor, "create-opening-night");

        MvcResult patched = mockMvc.perform(patch("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "patch-opening-night")
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("X-Request-Id", "t043-patch")
                        .content("""
                                {"articleId":"%s","changes":{"title":"Opening night revised"}}
                                """.formatted(article.articleId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.title").value("Opening night revised"))
                .andReturn();

        assertNotEquals("", patched.getResponse().getHeader(HttpHeaders.ETAG));
        mockMvc.perform(patch("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "patch-opening-night-stale")
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("X-Request-Id", "t043-stale")
                        .content("""
                                {"articleId":"%s","changes":{"title":"must not win"}}
                                """.formatted(article.articleId())))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"))
                .andExpect(jsonPath("$.errors[0].message").value("\"2\""));
    }

    @Test
    void roleBoundariesRejectEditorApprovalAndPublisherSubmission() throws Exception {
        var editor = actor("editor-2", RoleCode.EDITOR);
        var publisher = actor("publisher-1", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor, "create-role-boundary");

        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", article.articleId())
                        .principal(editor)
                        .header("Idempotency-Key", "approve-by-editor")
                        .header(HttpHeaders.IF_MATCH, "\"1\""))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "submit-by-publisher")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(get("/api/v1/editor/articles").principal(publisher))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(get("/api/v1/publisher/articles").principal(editor))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void publisherReadsCurrentRevisionAndServerReadinessThroughReviewApi() throws Exception {
        var editor = actor("editor-review-read", RoleCode.EDITOR);
        var publisher = actor("publisher-review-read", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor, "create-review-read");

        mockMvc.perform(get("/api/v1/publisher/articles/{id}", article.articleId())
                        .principal(publisher))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.articleId").value(article.articleId().toString()))
                .andExpect(jsonPath("$.revisionNumber").value(1))
                .andExpect(jsonPath("$.readiness.ready").value(true))
                .andExpect(jsonPath("$.readiness.blockingCodes").isEmpty());

        mockMvc.perform(get("/api/v1/publisher/articles")
                        .principal(publisher)
                        .param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].articleId").value(article.articleId().toString()));
    }

    @Test
    void editorCannotReadPublisherReviewEndpoints() throws Exception {
        var editor = actor("editor-review-boundary", RoleCode.EDITOR);
        CreatedArticle article = createArticle(editor, "create-review-boundary");

        mockMvc.perform(get("/api/v1/publisher/articles")
                        .principal(editor))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(get("/api/v1/publisher/articles/{id}", article.articleId())
                        .principal(editor))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void sameScopedRetryReplaysOneResultAndChangedPayloadConflicts() throws Exception {
        var editor = actor("editor-3", RoleCode.EDITOR);
        CreatedArticle article = createArticle(editor, "create-idempotency");
        String body = "{\"revisionId\":\"%s\"}".formatted(article.revisionId());

        MvcResult first = mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "submit-retry")
                        .header("X-Request-Id", "t043-first")
                        .content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andReturn();
        MvcResult replay = mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "submit-retry")
                        .header("X-Request-Id", "t043-replay")
                        .content(body))
                .andExpect(status().isAccepted())
                .andReturn();

        assertEquals(first.getResponse().getContentAsString(), replay.getResponse().getContentAsString());
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_review WHERE aggregate_id = ? AND decision = 'SUBMITTED'",
                Integer.class,
                article.articleId()
        ));

        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "submit-retry")
                        .content("{\"revisionId\":\"00000000-0000-7000-8000-000000000099\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void publisherSchedulePersistsAsiaTaipeiLocalTimeAsUtc() throws Exception {
        var editor = actor("editor-4", RoleCode.EDITOR);
        var publisher = actor("publisher-2", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor, "create-schedule");
        submit(article, editor, "submit-schedule");
        approve(article, publisher, 2, "approve-schedule");

        mockMvc.perform(post("/api/v1/publisher/articles/{id}:schedule", article.articleId())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "schedule-taipei")
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .content("""
                                {"publishAt":"2026-08-11T09:00:00","timezone":"Asia/Taipei"}
                                """))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.scheduledAt").value("2026-08-11T01:00:00Z"));

        assertEquals("SCHEDULED", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.articleId()));
        assertEquals("Asia/Taipei", jdbcTemplate.queryForObject(
                "SELECT timezone FROM publication_job WHERE aggregate_id = ?", String.class, article.articleId()));
        assertEquals("2026-08-11 01:00:00+00", jdbcTemplate.queryForObject(
                "SELECT scheduled_at::text FROM publication_job WHERE aggregate_id = ?", String.class, article.articleId()));
    }

    @Test
    void editorCreatesARevisionWithoutMutatingThePublishedSnapshotReference() throws Exception {
        Authentication editor = actor("editor-revision", RoleCode.EDITOR);
        CreatedArticle article = createArticle(editor, "create-revision");

        MvcResult revision = mockMvc.perform(post("/api/v1/editor/articles/{id}:revise", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"1\"")
                        .header("Idempotency-Key", "revision-create")
                        .content("""
                                {
                                  "title":"Opening night correction",
                                  "dek":"Corrected deck",
                                  "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000002","blocks":[{"id":"00000000-0000-4000-8000-000000000102","type":"paragraph","version":1,"payload":{"content":[{"kind":"text","text":"Opening night correction"}]}}]}
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.state").value("DRAFT"))
                .andReturn();

        assertNotEquals(
                article.revisionId().toString(),
                JSON.readTree(revision.getResponse().getContentAsString()).path("revisionId").asString()
        );
        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM article_revision WHERE article_id = ?", Integer.class, article.articleId()));

        mockMvc.perform(patch("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"2\"")
                        .header("Idempotency-Key", "revision-follow-up-patch")
                        .content("""
                                {"articleId":"%s","changes":{"title":"Correction patched"}}
                                """.formatted(article.articleId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(3))
                .andExpect(jsonPath("$.revisionNumber").value(2))
                .andExpect(jsonPath("$.title").value("Correction patched"));

        assertEquals(2, jdbcTemplate.queryForObject(
                "SELECT version FROM article_revision WHERE article_id = ? AND revision_number = 2",
                Integer.class,
                article.articleId()));
    }

    @Test
    void generatedRequestIdIsSharedByAuditAndResponse() throws Exception {
        Authentication editor = actor("editor-request-id", RoleCode.EDITOR);
        MvcResult created = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "request-id-create")
                        .content(CREATE_BODY.replace("opening-night", "request-id-article")))
                .andExpect(status().isCreated())
                .andReturn();

        String requestId = created.getResponse().getHeader("X-Request-Id");
        String articleId = JSON.readTree(created.getResponse().getContentAsString())
                .path("articleId").asString();
        assertEquals(requestId, jdbcTemplate.queryForObject(
                "SELECT request_id FROM audit_event WHERE target_type = 'ARTICLE' AND target_id = ?",
                String.class,
                java.util.UUID.fromString(articleId)));
    }

    @Test
    void contentMediaReferencesAreLinkedBeforeReadinessIsEvaluated() throws Exception {
        Authentication editor = actor("editor-content-media", RoleCode.EDITOR);
        java.util.UUID assetId = java.util.UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/jpeg', 1024, 10, 10, 'fixture alt', 'PROCESSING')
                """, assetId, "private/content-media/" + assetId, "a".repeat(64));
        String body = """
                {
                  "title":"Media linked",
                  "slug":"media-linked",
                  "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000003","blocks":[
                    {"id":"00000000-0000-4000-8000-000000000103","type":"image","version":1,"payload":{"assetId":"%s","altText":"fixture"}}
                  ]}
                }
                """.formatted(assetId);

        CreatedArticle article = readCreatedArticle(mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "content-media-create")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());

        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM article_revision_media WHERE article_revision_id = ? AND asset_id = ?",
                Integer.class,
                article.revisionId(),
                assetId));
    }

    @Test
    void publishFreezesCompletePublicMediaMetadataIntoTheArticleSnapshot() throws Exception {
        Authentication editor = actor("editor-freeze-media", RoleCode.EDITOR);
        Authentication publisher = actor("publisher-freeze-media", RoleCode.PUBLISHER);
        UUID assetId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/webp', 1024, 1200, 800, 'Frozen alt', 'READY')
                """, assetId, "private/frozen-media/" + assetId, "a".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    id, asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, ?, 'inline', ?, ?, 'image/webp', 1024, 1200, 800)
                """,
                UUID.randomUUID(),
                assetId,
                "published/frozen-media.webp",
                "a".repeat(64)
        );
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    id, asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status
                ) VALUES (?, ?, 'Courtside TW', 'Editorial license', '{PUBLIC_WEB}'::text[],
                    ARRAY['GLOBAL']::text[], '2026-08-01T00:00:00Z', '2027-08-01T00:00:00Z',
                    'Frozen credit', 'withdraw on notice', 'VALID')
                """, UUID.randomUUID(), assetId);
        String body = """
                {
                  "title":"Frozen media article",
                  "slug":"frozen-media-article",
                  "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000023","blocks":[
                    {"id":"00000000-0000-4000-8000-000000000123","type":"image","version":1,
                     "payload":{"assetId":"%s","altText":"Frozen alt","variant":"inline"}}
                  ]}
                }
                """.formatted(assetId);
        CreatedArticle article = readCreatedArticle(mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "freeze-media-create")
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        jdbcTemplate.update("""
                INSERT INTO article_revision_media (
                    article_revision_id, asset_id, required_channel, position
                ) VALUES (?, ?, 'OFFLINE', 2)
                """, article.revisionId(), assetId);
        assertEquals(2, jdbcTemplate.queryForObject(
                """
                SELECT count(*) FROM article_revision_media
                WHERE article_revision_id = ? AND asset_id = ?
                """,
                Integer.class,
                article.revisionId(),
                assetId
        ));
        submit(article, editor, "freeze-media-submit");
        approve(article, publisher, 2, "freeze-media-approve");
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:publish", article.articleId())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "freeze-media-publish"))
                .andExpect(status().isAccepted());

        var snapshot = JSON.readTree(jdbcTemplate.queryForObject(
                """
                SELECT content_document::text
                FROM publication_snapshot
                WHERE aggregate_type = 'ARTICLE' AND aggregate_id = ? AND revision_id = ?
                """,
                String.class,
                article.articleId(),
                article.revisionId()
        ));
        assertEquals(2, snapshot.path("projectionVersion").asInt());
        assertEquals(assetId.toString(), snapshot.path("media").path(0).path("assetId").asString());
        assertEquals("/media/published/frozen-media.webp",
                snapshot.path("media").path(0).path("url").asString());
        assertEquals("Frozen alt", snapshot.path("media").path(0).path("altText").asString());
        assertEquals("Frozen credit", snapshot.path("media").path(0).path("credit").asString());
        assertEquals("Courtside TW", snapshot.path("media").path(0).path("rightsOwner").asString());
        assertEquals("Editorial license", snapshot.path("media").path(0).path("licenseName").asString());
    }

    @Test
    void submitRejectsContentThatIsNotCanonicalContentDocumentV1() throws Exception {
        Authentication editor = actor("editor-invalid-content", RoleCode.EDITOR);
        MvcResult created = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "create-invalid-content")
                        .content("""
                                {
                                  "title":"Invalid content",
                                  "slug":"invalid-content",
                                  "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000017","blocks":[]}
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        CreatedArticle article = readCreatedArticle(created.getResponse().getContentAsString());

        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "submit-invalid-content")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value("CONTENT_NOT_READY"));
    }

    @Test
    void submitRejectsCanonicalContentWithoutReaderVisibleText() throws Exception {
        Authentication editor = actor("editor-divider-only", RoleCode.EDITOR);
        MvcResult created = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "create-divider-only")
                        .content("""
                                {
                                  "title":"Divider only",
                                  "slug":"divider-only",
                                  "content":{"schemaVersion":1,"documentId":"00000000-0000-7000-8000-000000000024","blocks":[
                                    {"id":"00000000-0000-4000-8000-000000000124","type":"divider","version":1,"payload":{"style":"solid"}}
                                  ]}
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        CreatedArticle article = readCreatedArticle(created.getResponse().getContentAsString());

        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "submit-divider-only")
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.code").value("RIGHTS_OR_CONTENT_GATE"))
                .andExpect(jsonPath("$.errors[0].code").value("CONTENT_NOT_READY"));

        assertEquals("DRAFT", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.articleId()));
        assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ?",
                Integer.class,
                article.articleId()));
    }

    @Test
    void publisherCanWithdrawThenArchiveWithoutDeletingThePublishedEvidence() throws Exception {
        Authentication editor = actor("editor-withdraw-archive", RoleCode.EDITOR);
        Authentication publisher = actor("publisher-withdraw-archive", RoleCode.PUBLISHER);
        CreatedArticle article = createArticle(editor, "create-withdraw-archive");
        submit(article, editor, "submit-withdraw-archive");
        approve(article, publisher, 2, "approve-withdraw-archive");

        mockMvc.perform(post("/api/v1/publisher/articles/{id}:publish", article.articleId())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"3\"")
                        .header("Idempotency-Key", "publish-withdraw-archive"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.version").value(4));
        var snapshot = JSON.readTree(jdbcTemplate.queryForObject(
                """
                SELECT content_document::text FROM publication_snapshot
                WHERE aggregate_type = 'ARTICLE' AND aggregate_id = ? AND revision_id = ?
                """,
                String.class,
                article.articleId(),
                article.revisionId()
        ));
        assertEquals("published-article", snapshot.path("snapshotType").asString());
        assertEquals(2, snapshot.path("projectionVersion").asInt());
        assertEquals(0, snapshot.path("media").size());
        assertEquals("Opening night fixture", snapshot.path("plainText").asString());
        assertEquals(1, snapshot.path("readingTimeMinutes").asInt());
        assertEquals("/articles/opening-night", snapshot.path("canonicalPath").asString());
        assertEquals("2026-08-10T00:00:00Z", snapshot.path("publishedAt").asString());
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:withdraw", article.articleId())
                        .principal(publisher)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.IF_MATCH, "\"4\"")
                        .header("Idempotency-Key", "withdraw-archive")
                        .content("{\"reason\":\"rights revoked\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("WITHDRAWN"))
                .andExpect(jsonPath("$.version").value(5));
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:archive", article.articleId())
                        .principal(publisher)
                        .header(HttpHeaders.IF_MATCH, "\"5\"")
                        .header("Idempotency-Key", "archive-withdrawn"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.version").value(6));

        assertEquals("ARCHIVED", jdbcTemplate.queryForObject(
                "SELECT state FROM article WHERE id = ?", String.class, article.articleId()));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM publication_snapshot WHERE aggregate_id = ?", Integer.class, article.articleId()));
    }

    @Test
    void malformedIfMatchUsesProblemDetailsInsteadOfSilentLastWriteWins() throws Exception {
        var editor = actor("editor-5", RoleCode.EDITOR);
        CreatedArticle article = createArticle(editor, "create-invalid-if-match");

        mockMvc.perform(patch("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", "invalid-if-match")
                        .header(HttpHeaders.IF_MATCH, "W/\"1\"")
                        .content("""
                                {"articleId":"%s","changes":{"title":"invalid"}}
                                """.formatted(article.articleId())))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void publicationMediaQueryCountsReferencedVariantsInsteadOfEveryDerivative() throws Exception {
        String articleSlug = "publication-media-variants";
        UUID assetId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_asset (
                    id, private_storage_key, checksum_sha256, mime_type, byte_size,
                    width, height, alt_text, processing_state
                ) VALUES (?, ?, ?, 'image/webp', 2048, 1200, 675, 'Referenced wide image', 'READY')
                """, assetId, "private/" + articleSlug + ".webp", "b".repeat(64));
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    id, asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                ) VALUES (?, ?, 'wide', ?, ?, 'image/webp', 1024, 1200, 675)
                """,
                UUID.randomUUID(),
                assetId,
                "published/" + articleSlug + ".webp",
                "b".repeat(64)
        );
        jdbcTemplate.update("""
                INSERT INTO rights_record (
                    id, asset_id, rights_owner, license_name, allowed_channels,
                    territories, valid_from, valid_until, credit, withdrawal_terms, status
                ) VALUES (?, ?, 'Courtside TW', 'Editorial license', '{PUBLIC_WEB}'::text[],
                    ARRAY['GLOBAL']::text[], '2026-08-01T00:00:00Z', '2027-08-01T00:00:00Z',
                    'Courtside TW', 'withdraw on notice', 'VALID')
                """, UUID.randomUUID(), assetId);
        var repository = new JdbcEditorialArticleRepository(jdbcTemplate);
        var draft = repository.insertDraft(
                "Media variants",
                articleSlug,
                "Only the referenced variant belongs in the snapshot",
                JSON.readTree("""
                {"schemaVersion":1,"documentId":"0190f7b0-7c4b-7e3a-8f12-123456789abc","blocks":[
                  {"id":"00000000-0000-4000-8000-000000000007","type":"image","version":1,
                   "payload":{"assetId":"%s","altText":"Referenced wide image","variant":"wide"}}
                ]}
                """.formatted(assetId))
        );
        jdbcTemplate.update("""
                INSERT INTO media_variant (
                    asset_id, variant, public_storage_key, checksum_sha256,
                    mime_type, byte_size, width, height
                )
                SELECT ?,
                       'extra-' || lpad(generated.value::text, 4, '0'),
                       'published/variant-bound/' || ? || '/' || generated.value || '.webp',
                       repeat('c', 64), 'image/webp', 1024, 1200, 675
                FROM generate_series(1, 5001) AS generated(value)
                """, assetId, assetId.toString());

        var media = repository.publicMedia(
                draft.revisionId(),
                Instant.parse("2026-08-10T00:00:00Z")
        );

        assertEquals(1, media.size());
        assertEquals("wide", media.getFirst().variant());
    }

    private CreatedArticle createArticle(Authentication editor, String key) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/editor/articles")
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", key)
                        .header("X-Request-Id", "t043-create")
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("DRAFT"))
                .andExpect(jsonPath("$.version").value(1))
                .andReturn();
        return readCreatedArticle(result.getResponse().getContentAsString());
    }

    private void submit(CreatedArticle article, Authentication editor, String key) throws Exception {
        mockMvc.perform(post("/api/v1/editor/articles/{id}:submit", article.articleId())
                        .principal(editor)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("Idempotency-Key", key)
                        .content("{\"revisionId\":\"%s\"}".formatted(article.revisionId())))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.version").value(2));
    }

    private void approve(
            CreatedArticle article,
            Authentication publisher,
            long expectedVersion,
            String key
    ) throws Exception {
        mockMvc.perform(post("/api/v1/publisher/articles/{id}:approve", article.articleId())
                        .principal(publisher)
                        .header("Idempotency-Key", key)
                        .header(HttpHeaders.IF_MATCH, "\"%d\"".formatted(expectedVersion)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.version").value(3));
    }
}
