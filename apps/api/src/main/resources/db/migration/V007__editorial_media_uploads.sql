-- T048 Editorial media upload lifecycle.
--
-- The application receives only bounded metadata. Original bytes stay behind
-- the private storage adapter and are fetched by the worker after completion.

ALTER TABLE media_asset
    ADD COLUMN original_filename text,
    ADD COLUMN upload_id uuid,
    ADD COLUMN upload_intent_expires_at timestamptz;

ALTER TABLE media_asset
    ADD CONSTRAINT media_asset_original_filename_ck CHECK (
        original_filename IS NULL
        OR (
            btrim(original_filename) <> ''
            AND length(original_filename) <= 255
            AND original_filename !~ '[[:cntrl:]/]'
        )
    ),
    ADD CONSTRAINT media_asset_upload_id_ck CHECK (
        (upload_id IS NULL AND upload_intent_expires_at IS NULL)
        OR (upload_id IS NOT NULL AND upload_intent_expires_at IS NOT NULL)
    );

CREATE UNIQUE INDEX media_asset_upload_id_uk
    ON media_asset (upload_id)
    WHERE upload_id IS NOT NULL;

CREATE TABLE media_upload_idempotency (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    actor_subject text NOT NULL,
    operation text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash_sha256 text NOT NULL,
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT media_upload_idempotency_actor_ck CHECK (
        btrim(actor_subject) <> '' AND length(actor_subject) <= 512
    ),
    CONSTRAINT media_upload_idempotency_operation_ck CHECK (
        operation IN ('CREATE_UPLOAD', 'COMPLETE_UPLOAD')
    ),
    CONSTRAINT media_upload_idempotency_key_ck CHECK (
        btrim(idempotency_key) <> '' AND length(idempotency_key) <= 512
    ),
    CONSTRAINT media_upload_idempotency_hash_ck CHECK (
        request_hash_sha256 ~ '^[0-9a-fA-F]{64}$'
    ),
    CONSTRAINT media_upload_idempotency_response_ck CHECK (jsonb_typeof(response) = 'object'),
    CONSTRAINT media_upload_idempotency_uk UNIQUE (actor_subject, operation, idempotency_key)
);

REVOKE ALL ON TABLE media_upload_idempotency FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE media_upload_idempotency TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE media_upload_idempotency FROM courtside_app;
