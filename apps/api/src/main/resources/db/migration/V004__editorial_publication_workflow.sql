-- T045 Editorial publication workflow persistence
--
-- The public reader remains a projection of published snapshots. These tables
-- keep editorial decisions, rights checks, immutable snapshots, and retryable
-- commands separate so a publication action can be audited and replayed
-- without changing the public read path.

CREATE TABLE publication_review (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    revision_id uuid,
    reviewer_subject text NOT NULL,
    reviewer_role text NOT NULL,
    decision text NOT NULL,
    reason text,
    occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT publication_review_aggregate_type_ck CHECK (aggregate_type IN ('ISSUE', 'ARTICLE')),
    CONSTRAINT publication_review_reviewer_subject_ck CHECK (
        btrim(reviewer_subject) <> '' AND length(reviewer_subject) <= 512
    ),
    CONSTRAINT publication_review_reviewer_role_ck CHECK (reviewer_role IN ('EDITOR', 'PUBLISHER')),
    CONSTRAINT publication_review_decision_ck CHECK (
        decision IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN')
    ),
    CONSTRAINT publication_review_reason_ck CHECK (reason IS NULL OR length(reason) <= 2000)
);

CREATE INDEX publication_review_target_idx
    ON publication_review (aggregate_type, aggregate_id, occurred_at DESC, id DESC);

CREATE TABLE publication_rights_reference (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    revision_id uuid,
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    required_channel text NOT NULL,
    decision_code text NOT NULL,
    checked_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    checked_by text NOT NULL,
    CONSTRAINT publication_rights_reference_aggregate_type_ck CHECK (
        aggregate_type IN ('ISSUE', 'ARTICLE')
    ),
    CONSTRAINT publication_rights_reference_channel_ck CHECK (
        required_channel IN ('PUBLIC_WEB', 'READER_LIBRARY', 'OFFLINE', 'PROVENANCE')
    ),
    CONSTRAINT publication_rights_reference_decision_ck CHECK (
        decision_code IN (
            'RIGHTS_ALLOWED',
            'RIGHTS_MISSING',
            'RIGHTS_EXPIRED',
            'RIGHTS_REVOKED',
            'RIGHTS_WRONG_CHANNEL'
        )
    ),
    CONSTRAINT publication_rights_reference_checked_by_ck CHECK (
        btrim(checked_by) <> '' AND length(checked_by) <= 512
    ),
    CONSTRAINT publication_rights_reference_uk UNIQUE (
        aggregate_type, aggregate_id, revision_id, asset_id, required_channel, checked_at
    )
);

CREATE INDEX publication_rights_reference_asset_idx
    ON publication_rights_reference (asset_id, checked_at DESC, id DESC);

CREATE TABLE publication_snapshot (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    revision_id uuid,
    snapshot_version bigint NOT NULL,
    content_document jsonb NOT NULL,
    checksum_sha256 text NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT publication_snapshot_aggregate_type_ck CHECK (
        aggregate_type IN ('ISSUE', 'ARTICLE')
    ),
    CONSTRAINT publication_snapshot_version_ck CHECK (snapshot_version > 0),
    CONSTRAINT publication_snapshot_document_ck CHECK (jsonb_typeof(content_document) = 'object'),
    CONSTRAINT publication_snapshot_checksum_ck CHECK (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
    CONSTRAINT publication_snapshot_created_by_ck CHECK (
        btrim(created_by) <> '' AND length(created_by) <= 512
    ),
    CONSTRAINT publication_snapshot_version_uk UNIQUE (aggregate_type, aggregate_id, snapshot_version)
);

CREATE INDEX publication_snapshot_target_idx
    ON publication_snapshot (aggregate_type, aggregate_id, snapshot_version DESC);

CREATE TABLE publication_job (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    requested_by text NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    scheduled_at timestamptz,
    timezone text,
    status text NOT NULL DEFAULT 'PENDING',
    attempt_count integer NOT NULL DEFAULT 0,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    processed_at timestamptz,
    CONSTRAINT publication_job_aggregate_type_ck CHECK (aggregate_type IN ('ISSUE', 'ARTICLE')),
    CONSTRAINT publication_job_operation_ck CHECK (
        operation IN ('SUBMIT', 'APPROVE', 'SCHEDULE', 'PUBLISH', 'WITHDRAW', 'ARCHIVE')
    ),
    CONSTRAINT publication_job_idempotency_key_ck CHECK (
        btrim(idempotency_key) <> '' AND length(idempotency_key) <= 512
    ),
    CONSTRAINT publication_job_requested_by_ck CHECK (
        btrim(requested_by) <> '' AND length(requested_by) <= 512
    ),
    CONSTRAINT publication_job_timezone_ck CHECK (
        timezone IS NULL OR (btrim(timezone) <> '' AND length(timezone) <= 128)
    ),
    CONSTRAINT publication_job_status_ck CHECK (
        status IN ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER')
    ),
    CONSTRAINT publication_job_attempt_count_ck CHECK (attempt_count >= 0),
    CONSTRAINT publication_job_payload_ck CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT publication_job_error_ck CHECK (last_error IS NULL OR length(last_error) <= 4000),
    CONSTRAINT publication_job_idempotency_uk UNIQUE (idempotency_key)
);

CREATE INDEX publication_job_claim_idx
    ON publication_job (scheduled_at, created_at, id)
    WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE publication_idempotency (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    actor_subject text NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash_sha256 text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    expires_at timestamptz,
    CONSTRAINT publication_idempotency_actor_subject_ck CHECK (
        btrim(actor_subject) <> '' AND length(actor_subject) <= 512
    ),
    CONSTRAINT publication_idempotency_operation_ck CHECK (
        operation IN ('SUBMIT', 'APPROVE', 'SCHEDULE', 'PUBLISH', 'WITHDRAW', 'ARCHIVE')
    ),
    CONSTRAINT publication_idempotency_key_ck CHECK (
        btrim(idempotency_key) <> '' AND length(idempotency_key) <= 512
    ),
    CONSTRAINT publication_idempotency_request_hash_ck CHECK (
        request_hash_sha256 ~ '^[0-9a-fA-F]{64}$'
    ),
    CONSTRAINT publication_idempotency_response_ck CHECK (jsonb_typeof(response) = 'object'),
    CONSTRAINT publication_idempotency_expiry_ck CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT publication_idempotency_uk UNIQUE (actor_subject, operation, idempotency_key)
);

CREATE TABLE publication_impact_link (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    snapshot_id uuid NOT NULL REFERENCES publication_snapshot (id) ON DELETE RESTRICT,
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    impact_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT publication_impact_link_type_ck CHECK (
        impact_type IN ('CONTENT_MEDIA', 'COVER_MEDIA', 'PROVENANCE_MEDIA')
    ),
    CONSTRAINT publication_impact_link_uk UNIQUE (snapshot_id, asset_id, impact_type)
);

CREATE OR REPLACE FUNCTION reject_publication_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'publication workflow evidence is append-only';
END;
$$;

CREATE TRIGGER publication_review_append_only
    BEFORE UPDATE OR DELETE ON publication_review
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();

CREATE TRIGGER publication_rights_reference_append_only
    BEFORE UPDATE OR DELETE ON publication_rights_reference
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();

CREATE TRIGGER publication_snapshot_append_only
    BEFORE UPDATE OR DELETE ON publication_snapshot
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();

CREATE TRIGGER publication_impact_link_append_only
    BEFORE UPDATE OR DELETE ON publication_impact_link
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();

REVOKE ALL ON TABLE
    publication_review,
    publication_rights_reference,
    publication_snapshot,
    publication_job,
    publication_idempotency,
    publication_impact_link
FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE
    publication_review,
    publication_rights_reference,
    publication_snapshot,
    publication_impact_link
TO courtside_app;

GRANT SELECT, INSERT, UPDATE ON TABLE publication_job TO courtside_app;
GRANT SELECT, INSERT ON TABLE publication_idempotency TO courtside_app;

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
    publication_review,
    publication_rights_reference,
    publication_snapshot,
    publication_job,
    publication_idempotency,
    publication_impact_link
FROM courtside_app;
