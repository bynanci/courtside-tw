-- Persist the article revision selected for an editorial TOC. Existing public
-- issue snapshots remain immutable; legacy live assignments adopt the pointer
-- they previously resolved dynamically. Unpublished legacy entries stay NULL
-- and fail publication readiness until an editor replaces them explicitly.
ALTER TABLE issue_article ADD COLUMN revision_id uuid;
UPDATE issue_article entry SET revision_id = article.published_revision_id
    FROM article WHERE article.id = entry.article_id;
ALTER TABLE issue_article ADD CONSTRAINT issue_article_revision_owner_fk
    FOREIGN KEY (article_id, revision_id) REFERENCES article_revision (article_id, id)
    ON DELETE RESTRICT;

ALTER TABLE publication_idempotency DROP CONSTRAINT publication_idempotency_operation_ck;
ALTER TABLE publication_idempotency ADD CONSTRAINT publication_idempotency_operation_ck CHECK (
    operation IN ('CREATE_ISSUE', 'PATCH_ISSUE', 'CREATE_SECTION', 'PATCH_SECTION',
        'REORDER_SECTIONS', 'DELETE_SECTION', 'REPLACE_ISSUE_ARTICLES', 'CREATE_REVISION',
        'CREATE_ARTICLE', 'PATCH_ARTICLE', 'REVOKE_MEDIA', 'SUBMIT', 'REQUEST_CHANGES',
        'APPROVE', 'SCHEDULE', 'PUBLISH', 'WITHDRAW', 'ARCHIVE')
);
GRANT DELETE ON issue_article TO courtside_app;

-- Prevent application writes from editing a reviewed/published issue's TOC.
-- Taking the aggregate lock serializes membership changes with issue review.
CREATE FUNCTION protect_issue_article_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    issue_state text;
    aggregate_id uuid;
BEGIN
    aggregate_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.issue_id ELSE NEW.issue_id END;
    SELECT state INTO issue_state FROM publication_issue WHERE id = aggregate_id FOR UPDATE;
    IF issue_state IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'only draft issue article assignments can change';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.issue_id IS DISTINCT FROM OLD.issue_id THEN
        RAISE EXCEPTION 'issue article assignment cannot move across issue aggregates';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER issue_article_draft_only BEFORE INSERT OR UPDATE OR DELETE
    ON issue_article FOR EACH ROW EXECUTE FUNCTION protect_issue_article_assignment();
