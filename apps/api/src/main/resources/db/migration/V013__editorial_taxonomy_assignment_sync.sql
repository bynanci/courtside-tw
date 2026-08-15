-- T059 remediation: replace one revision's controlled taxonomy assignment set.
--
-- article_taxonomy intentionally omits direct DELETE access for courtside_app.
-- This narrow SECURITY DEFINER function preserves that boundary while allowing
-- the editorial repository to replace only the assignments for one revision.

CREATE OR REPLACE FUNCTION replace_article_revision_taxonomy(
    p_revision_id uuid,
    p_term_ids jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
    IF p_revision_id IS NULL OR jsonb_typeof(p_term_ids) <> 'array' THEN
        RAISE EXCEPTION 'revision id and taxonomy term id array are required';
    END IF;

    IF jsonb_array_length(p_term_ids) > 20 THEN
        RAISE EXCEPTION 'at most 20 taxonomy terms may be assigned';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM article_revision revision
        WHERE revision.id = p_revision_id
          AND revision.state = 'DRAFT'
    ) THEN
        RAISE EXCEPTION 'taxonomy may only be replaced on a draft revision';
    END IF;

    IF (
        SELECT count(*) <> count(DISTINCT requested.term_id)
        FROM jsonb_array_elements_text(p_term_ids) AS requested(term_id)
    ) THEN
        RAISE EXCEPTION 'taxonomy term ids must be distinct';
    END IF;

    IF (
        SELECT count(*)
        FROM taxonomy_term term
        JOIN jsonb_array_elements_text(p_term_ids) AS requested(term_id)
          ON term.id = requested.term_id::uuid
        WHERE term.status = 'ACTIVE'
          AND term.valid_from <= transaction_timestamp()
          AND (term.valid_until IS NULL OR term.valid_until > transaction_timestamp())
    ) <> jsonb_array_length(p_term_ids) THEN
        RAISE EXCEPTION 'taxonomy terms must exist and be active at execution time';
    END IF;

    DELETE FROM article_taxonomy assignment
    WHERE assignment.article_revision_id = p_revision_id
      AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(p_term_ids) AS requested(term_id)
          WHERE requested.term_id::uuid = assignment.term_id
      );

    INSERT INTO article_taxonomy (article_revision_id, term_id, relevance)
    SELECT p_revision_id,
           requested.term_id::uuid,
           CASE WHEN requested.position = 1 THEN 'PRIMARY' ELSE 'SECONDARY' END
    FROM jsonb_array_elements_text(p_term_ids) WITH ORDINALITY
        AS requested(term_id, position)
    ON CONFLICT (article_revision_id, term_id)
    DO UPDATE SET relevance = EXCLUDED.relevance;
END;
$$;

REVOKE ALL ON FUNCTION replace_article_revision_taxonomy(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_article_revision_taxonomy(uuid, jsonb) TO courtside_app;
