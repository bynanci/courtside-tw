-- Expand-only editorial contributor commands and verified identity observations.
-- Role observations describe signed claims seen by this API, not IdP administration.
ALTER TABLE contributor ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED'));

CREATE TABLE contributor_command_receipt (
    actor_subject text NOT NULL,
    operation text NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'ARCHIVE', 'ASSIGN')),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
    request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (actor_subject, operation, idempotency_key)
);
CREATE TRIGGER contributor_receipt_append_only BEFORE UPDATE OR DELETE
    ON contributor_command_receipt FOR EACH ROW
    EXECUTE FUNCTION reject_publication_append_only_mutation();

CREATE TABLE identity_role_observation (
    identity_digest text PRIMARY KEY CHECK (identity_digest ~ '^[0-9a-f]{64}$'),
    roles text[] NOT NULL CHECK (roles <@ ARRAY['READER', 'EDITOR', 'PUBLISHER', 'ADMIN']::text[]),
    token_issued_at timestamptz NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

-- The application can maintain current observations, but the audit event remains
-- under the foundation's independent append-only owner and mutation trigger.
REVOKE ALL ON contributor_command_receipt, identity_role_observation FROM PUBLIC;
GRANT SELECT, INSERT ON contributor_command_receipt TO courtside_app;
GRANT SELECT, INSERT, UPDATE ON identity_role_observation TO courtside_app;
GRANT INSERT, UPDATE ON contributor TO courtside_app;
GRANT INSERT, DELETE ON article_contributor TO courtside_app;

CREATE FUNCTION protect_contributor_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.display_name IS DISTINCT FROM OLD.display_name
            AND EXISTS (SELECT 1 FROM article_contributor WHERE contributor_id = OLD.id) THEN
        RAISE EXCEPTION 'assigned contributor credit is immutable; create a new contributor identity';
    END IF;
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'contributor slug is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER contributor_credit_immutable BEFORE UPDATE ON contributor
    FOR EACH ROW EXECUTE FUNCTION protect_contributor_credit();

CREATE FUNCTION protect_revision_contributor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    revision_state text;
    revision_id uuid;
BEGIN
    revision_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.article_revision_id ELSE NEW.article_revision_id END;
    SELECT state INTO revision_state FROM article_revision WHERE id = revision_id FOR UPDATE;
    IF revision_state IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'only draft revision credits can change';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER revision_contributor_draft_only BEFORE INSERT OR UPDATE OR DELETE
    ON article_contributor FOR EACH ROW EXECUTE FUNCTION protect_revision_contributor();
