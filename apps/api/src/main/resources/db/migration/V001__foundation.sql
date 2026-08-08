-- T013 Database Foundation
--
-- This migration is executed by a privileged migration/bootstrap role. The
-- application connection must use a separately provisioned login that is a
-- member of courtside_app; courtside_app deliberately owns no tables.
--
-- PostgreSQL 18 is required because all foundation identifiers use the native
-- uuidv7() function. Provider credentials and login membership are provisioned
-- outside this migration; no password or production secret belongs here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'courtside_app') THEN
        EXECUTE 'CREATE ROLE courtside_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
    ELSE
        EXECUTE 'ALTER ROLE courtside_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'courtside_audit_owner') THEN
        EXECUTE 'CREATE ROLE courtside_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
    ELSE
        EXECUTE 'ALTER ROLE courtside_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS';
    END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM courtside_app;
GRANT USAGE ON SCHEMA public TO courtside_app;

CREATE TABLE reader_profile (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    issuer text NOT NULL,
    subject text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT reader_profile_issuer_not_blank CHECK (btrim(issuer) <> '' AND length(issuer) <= 2048),
    CONSTRAINT reader_profile_subject_not_blank CHECK (btrim(subject) <> '' AND length(subject) <= 512),
    CONSTRAINT reader_profile_version_non_negative CHECK (version >= 0),
    CONSTRAINT reader_profile_issuer_subject_uk UNIQUE (issuer, subject)
);

CREATE TABLE role_assignment (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    reader_id uuid NOT NULL REFERENCES reader_profile (id) ON DELETE RESTRICT,
    role_code text NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    revoked_at timestamptz,
    granted_by text,
    CONSTRAINT role_assignment_role_code_ck CHECK (role_code IN ('READER', 'EDITOR', 'PUBLISHER', 'ADMIN')),
    CONSTRAINT role_assignment_granted_by_ck CHECK (granted_by IS NULL OR (btrim(granted_by) <> '' AND length(granted_by) <= 512)),
    CONSTRAINT role_assignment_time_order_ck CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX role_assignment_active_uk
    ON role_assignment (reader_id, role_code)
    WHERE revoked_at IS NULL;

CREATE INDEX role_assignment_reader_idx ON role_assignment (reader_id, role_code);

CREATE TABLE media_asset (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    private_storage_key text NOT NULL,
    checksum_sha256 text NOT NULL,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL,
    width integer,
    height integer,
    alt_text text,
    processing_state text NOT NULL DEFAULT 'PENDING',
    created_by uuid REFERENCES reader_profile (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT media_asset_private_key_not_blank CHECK (btrim(private_storage_key) <> ''),
    CONSTRAINT media_asset_checksum_sha256_ck CHECK (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
    CONSTRAINT media_asset_mime_type_ck CHECK (mime_type IN ('image/avif', 'image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT media_asset_byte_size_ck CHECK (byte_size > 0 AND byte_size <= 20971520),
    CONSTRAINT media_asset_dimensions_ck CHECK (
        (width IS NULL AND height IS NULL)
        OR (width IS NOT NULL AND height IS NOT NULL AND width > 0 AND height > 0)
    ),
    CONSTRAINT media_asset_alt_text_ck CHECK (alt_text IS NULL OR length(alt_text) <= 1000),
    CONSTRAINT media_asset_processing_state_ck CHECK (processing_state IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'REVOKED')),
    CONSTRAINT media_asset_ready_alt_text_ck CHECK (processing_state <> 'READY' OR (alt_text IS NOT NULL AND btrim(alt_text) <> '')),
    CONSTRAINT media_asset_version_non_negative CHECK (version >= 0),
    CONSTRAINT media_asset_private_key_uk UNIQUE (private_storage_key)
);

CREATE INDEX media_asset_processing_idx
    ON media_asset (processing_state, created_at, id);

CREATE TABLE media_variant (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    variant text NOT NULL,
    public_storage_key text NOT NULL,
    checksum_sha256 text NOT NULL,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT media_variant_name_ck CHECK (variant ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
    CONSTRAINT media_variant_public_key_not_blank CHECK (btrim(public_storage_key) <> ''),
    CONSTRAINT media_variant_checksum_sha256_ck CHECK (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
    CONSTRAINT media_variant_mime_type_ck CHECK (mime_type IN ('image/avif', 'image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT media_variant_byte_size_ck CHECK (byte_size > 0),
    CONSTRAINT media_variant_dimensions_ck CHECK (width > 0 AND height > 0),
    CONSTRAINT media_variant_asset_variant_uk UNIQUE (asset_id, variant),
    CONSTRAINT media_variant_public_key_uk UNIQUE (public_storage_key)
);

CREATE TABLE rights_record (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    rights_owner text NOT NULL,
    license_name text NOT NULL,
    allowed_channels text[] NOT NULL,
    territories text[] NOT NULL DEFAULT ARRAY['GLOBAL']::text[],
    valid_from timestamptz NOT NULL,
    valid_until timestamptz NOT NULL,
    credit text NOT NULL,
    withdrawal_terms text NOT NULL,
    status text NOT NULL DEFAULT 'UNKNOWN',
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT rights_record_owner_ck CHECK (btrim(rights_owner) <> '' AND length(rights_owner) <= 512),
    CONSTRAINT rights_record_license_ck CHECK (btrim(license_name) <> '' AND length(license_name) <= 512),
    CONSTRAINT rights_record_channels_ck CHECK (
        cardinality(allowed_channels) > 0
        AND allowed_channels <@ ARRAY['PUBLIC_WEB', 'READER_LIBRARY', 'OFFLINE', 'PROVENANCE']::text[]
    ),
    CONSTRAINT rights_record_territories_ck CHECK (cardinality(territories) > 0),
    CONSTRAINT rights_record_time_order_ck CHECK (valid_until > valid_from),
    CONSTRAINT rights_record_credit_ck CHECK (btrim(credit) <> '' AND length(credit) <= 1000),
    CONSTRAINT rights_record_withdrawal_terms_ck CHECK (btrim(withdrawal_terms) <> '' AND length(withdrawal_terms) <= 2000),
    CONSTRAINT rights_record_status_ck CHECK (status IN ('UNKNOWN', 'PENDING', 'VALID', 'EXPIRED', 'REVOKED', 'BLOCKED')),
    CONSTRAINT rights_record_version_non_negative CHECK (version >= 0)
);

CREATE INDEX rights_record_asset_status_idx
    ON rights_record (asset_id, status, valid_from, valid_until);

CREATE TABLE audit_event (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor_type text NOT NULL,
    actor_subject text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    request_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT audit_event_actor_type_ck CHECK (actor_type IN ('USER', 'SYSTEM', 'SERVICE', 'ANONYMOUS')),
    CONSTRAINT audit_event_actor_subject_ck CHECK (btrim(actor_subject) <> '' AND length(actor_subject) <= 512),
    CONSTRAINT audit_event_action_ck CHECK (btrim(action) <> '' AND length(action) <= 128),
    CONSTRAINT audit_event_target_type_ck CHECK (btrim(target_type) <> '' AND length(target_type) <= 128),
    CONSTRAINT audit_event_request_id_ck CHECK (request_id IS NULL OR (btrim(request_id) <> '' AND length(request_id) <= 128)),
    CONSTRAINT audit_event_metadata_object_ck CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_event_target_idx ON audit_event (target_type, target_id, occurred_at DESC);
CREATE INDEX audit_event_actor_idx ON audit_event (actor_type, actor_subject, occurred_at DESC);

CREATE TABLE outbox_event (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'PENDING',
    available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    attempt_count integer NOT NULL DEFAULT 0,
    lease_owner text,
    lease_until timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    processed_at timestamptz,
    dead_lettered_at timestamptz,
    CONSTRAINT outbox_event_type_ck CHECK (btrim(event_type) <> '' AND length(event_type) <= 160),
    CONSTRAINT outbox_aggregate_type_ck CHECK (btrim(aggregate_type) <> '' AND length(aggregate_type) <= 128),
    CONSTRAINT outbox_idempotency_key_ck CHECK (btrim(idempotency_key) <> '' AND length(idempotency_key) <= 512),
    CONSTRAINT outbox_payload_object_ck CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT outbox_status_ck CHECK (status IN ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
    CONSTRAINT outbox_attempt_count_ck CHECK (attempt_count >= 0),
    CONSTRAINT outbox_lease_ck CHECK (
        status <> 'CLAIMED'
        OR (lease_owner IS NOT NULL AND btrim(lease_owner) <> '' AND lease_until IS NOT NULL)
    ),
    CONSTRAINT outbox_error_ck CHECK (last_error IS NULL OR length(last_error) <= 4000),
    CONSTRAINT outbox_idempotency_uk UNIQUE (idempotency_key)
);

CREATE INDEX outbox_claim_idx
    ON outbox_event (available_at, created_at, id)
    WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX outbox_lease_idx
    ON outbox_event (lease_until, id)
    WHERE status = 'CLAIMED';

-- Foundation permissions: the application may transact domain data and
-- append/read audit events, but it has no UPDATE/DELETE/TRUNCATE privilege on
-- audit_event and does not own the table. Worker/administrative privileges
-- remain separate follow-up work.
REVOKE ALL ON TABLE reader_profile, role_assignment, media_asset, media_variant, rights_record, audit_event, outbox_event FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE reader_profile TO courtside_app;
GRANT SELECT ON TABLE role_assignment TO courtside_app;
GRANT SELECT, INSERT, UPDATE ON TABLE media_asset, media_variant, rights_record TO courtside_app;
GRANT SELECT, INSERT, UPDATE ON TABLE outbox_event TO courtside_app;
GRANT SELECT, INSERT ON TABLE audit_event TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE audit_event FROM courtside_app;

-- Transfer ownership only after the migration role has applied the grants.
-- PostgreSQL requires the destination role to have CREATE on the schema while
-- ownership is transferred; remove that temporary capability immediately.
GRANT CREATE ON SCHEMA public TO courtside_audit_owner;
ALTER TABLE audit_event OWNER TO courtside_audit_owner;
REVOKE CREATE ON SCHEMA public FROM courtside_audit_owner;
