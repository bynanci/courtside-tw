-- US5 reader library
--
-- V006 is already occupied by editorial commands. This migration therefore
-- uses the next monotonic version while preserving the T065 data contract.

CREATE TABLE bookmark (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    reader_id uuid NOT NULL REFERENCES reader_profile (id) ON DELETE CASCADE,
    article_id uuid NOT NULL REFERENCES article (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT bookmark_reader_article_uk UNIQUE (reader_id, article_id)
);

CREATE INDEX bookmark_reader_created_idx
    ON bookmark (reader_id, created_at DESC, id DESC);

CREATE TABLE reading_progress (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    reader_id uuid NOT NULL REFERENCES reader_profile (id) ON DELETE CASCADE,
    article_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    block_id uuid NOT NULL,
    percent numeric(5, 2) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT reading_progress_article_revision_fk
        FOREIGN KEY (article_id, revision_id)
        REFERENCES article_revision (article_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT reading_progress_percent_ck CHECK (percent >= 0 AND percent <= 100),
    CONSTRAINT reading_progress_version_ck CHECK (version >= 0),
    CONSTRAINT reading_progress_reader_article_uk UNIQUE (reader_id, article_id)
);

CREATE INDEX reading_progress_reader_updated_idx
    ON reading_progress (reader_id, updated_at DESC, id DESC);

CREATE TABLE account_erasure_job (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    identity_digest text NOT NULL,
    idempotency_key text NOT NULL,
    status text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    completed_at timestamptz,
    CONSTRAINT account_erasure_identity_digest_ck CHECK (
        identity_digest ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT account_erasure_idempotency_key_ck CHECK (
        btrim(idempotency_key) <> '' AND length(idempotency_key) <= 200
    ),
    CONSTRAINT account_erasure_status_ck CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')
    ),
    CONSTRAINT account_erasure_completion_ck CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR (status <> 'COMPLETED' AND completed_at IS NULL)
    ),
    CONSTRAINT account_erasure_idempotency_uk UNIQUE (idempotency_key)
);

REVOKE ALL ON TABLE bookmark, reading_progress, account_erasure_job FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bookmark, reading_progress TO courtside_app;
GRANT SELECT, INSERT ON TABLE account_erasure_job TO courtside_app;
GRANT UPDATE (revoked_at) ON TABLE role_assignment TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE account_erasure_job FROM courtside_app;
