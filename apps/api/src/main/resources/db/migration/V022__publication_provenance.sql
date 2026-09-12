-- Edition provenance is a projection of immutable publication snapshots.
-- Wallet identities belong to fanpassport/identity (ADR-0008), not this table.
-- Only a separately approved operations role can insert this record. The application cannot self-approve permanence.
CREATE TABLE publication_provenance_mirror_approval (
    publication_id uuid NOT NULL,
    snapshot_checksum text NOT NULL CHECK (snapshot_checksum ~ '^[0-9a-f]{64}$'),
    approval_ref_sha256 text NOT NULL CHECK (approval_ref_sha256 ~ '^[0-9a-f]{64}$'),
    approved_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    revoked_at timestamptz,
    PRIMARY KEY(publication_id, snapshot_checksum)
);
REVOKE ALL ON publication_provenance_mirror_approval FROM PUBLIC;
GRANT SELECT ON publication_provenance_mirror_approval TO courtside_app;

CREATE TABLE publication_provenance_asset (
    snapshot_id uuid NOT NULL REFERENCES publication_snapshot(id) ON DELETE RESTRICT,
    asset_id uuid NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
    digest text NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
    PRIMARY KEY(snapshot_id, asset_id)
);
CREATE FUNCTION freeze_provenance_cover_digest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO publication_provenance_asset(snapshot_id, asset_id, digest)
    SELECT NEW.snapshot_id, NEW.asset_id, 'sha256:' || lower(v.checksum_sha256)
    FROM media_variant v WHERE v.asset_id = NEW.asset_id AND v.variant = 'cover'
    ON CONFLICT (snapshot_id, asset_id) DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER freeze_provenance_cover AFTER INSERT ON publication_impact_link
    FOR EACH ROW EXECUTE FUNCTION freeze_provenance_cover_digest();
CREATE TRIGGER provenance_asset_append_only BEFORE UPDATE OR DELETE ON publication_provenance_asset
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();
REVOKE ALL ON publication_provenance_asset FROM PUBLIC;
GRANT SELECT, INSERT ON publication_provenance_asset TO courtside_app;

CREATE TABLE publication_provenance (
    snapshot_id uuid NOT NULL REFERENCES publication_snapshot(id) ON DELETE RESTRICT,
    manifest_version text NOT NULL CHECK (manifest_version = '1'),
    canonical_manifest text NOT NULL CHECK (length(canonical_manifest) <= 150000),
    digest text NOT NULL CHECK (digest ~ '^sha256:[0-9a-f]{64}$'),
    cid text,
    attestation jsonb,
    status text NOT NULL CHECK (status IN ('PENDING','VERIFIED','FAILED','SUPERSEDED','WITHDRAWN')),
    verified_at timestamptz,
    PRIMARY KEY (snapshot_id, manifest_version)
);
CREATE TABLE publication_provenance_history (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    snapshot_id uuid NOT NULL,
    manifest_version text NOT NULL,
    status text NOT NULL CHECK (status IN ('PENDING','VERIFIED','FAILED','SUPERSEDED','WITHDRAWN')),
    effective_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    FOREIGN KEY (snapshot_id, manifest_version) REFERENCES publication_provenance(snapshot_id, manifest_version)
);
CREATE FUNCTION protect_provenance_manifest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.manifest_version IS DISTINCT FROM OLD.manifest_version
       OR NEW.canonical_manifest IS DISTINCT FROM OLD.canonical_manifest
       OR NEW.digest IS DISTINCT FROM OLD.digest THEN
        RAISE EXCEPTION 'provenance manifest is immutable';
    END IF;
    IF OLD.status = 'WITHDRAWN' AND NEW.status <> 'WITHDRAWN' THEN
        RAISE EXCEPTION 'withdrawn provenance cannot be resurrected';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER provenance_immutable BEFORE UPDATE OR DELETE ON publication_provenance
    FOR EACH ROW EXECUTE FUNCTION protect_provenance_manifest();
CREATE FUNCTION append_provenance_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO publication_provenance_history(snapshot_id, manifest_version, status)
        VALUES (NEW.snapshot_id, NEW.manifest_version, NEW.status);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER provenance_status_history AFTER INSERT OR UPDATE ON publication_provenance
    FOR EACH ROW EXECUTE FUNCTION append_provenance_history();
CREATE TRIGGER provenance_history_append_only BEFORE UPDATE OR DELETE ON publication_provenance_history
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();

-- Insert in the same transaction as the authoritative snapshot; duplicates are no-ops.
CREATE FUNCTION enqueue_snapshot_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO outbox_event(event_type, aggregate_type, aggregate_id, idempotency_key, payload)
    VALUES ('provenance.snapshot', 'PUBLICATION_SNAPSHOT', NEW.id,
        'provenance:' || NEW.id::text || ':v1', jsonb_build_object('snapshotId', NEW.id::text))
    ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER snapshot_provenance_outbox AFTER INSERT ON publication_snapshot
    FOR EACH ROW EXECUTE FUNCTION enqueue_snapshot_provenance();
INSERT INTO outbox_event(event_type, aggregate_type, aggregate_id, idempotency_key, payload)
SELECT 'provenance.snapshot', 'PUBLICATION_SNAPSHOT', id, 'provenance:' || id::text || ':v1',
    jsonb_build_object('snapshotId', id::text) FROM publication_snapshot
ON CONFLICT (idempotency_key) DO NOTHING;

-- Withdrawal wins immediately, independently of worker/gateway availability.
CREATE FUNCTION withdraw_publication_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state IN ('WITHDRAWN','ARCHIVED') AND OLD.state IS DISTINCT FROM NEW.state THEN
        UPDATE publication_provenance p SET status = 'WITHDRAWN'
        FROM publication_snapshot s WHERE p.snapshot_id = s.id AND s.aggregate_id = NEW.id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER issue_provenance_withdrawal AFTER UPDATE ON publication_issue
    FOR EACH ROW EXECUTE FUNCTION withdraw_publication_provenance();
CREATE TRIGGER article_provenance_withdrawal AFTER UPDATE ON article
    FOR EACH ROW EXECUTE FUNCTION withdraw_publication_provenance();
REVOKE ALL ON publication_provenance, publication_provenance_history FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON publication_provenance TO courtside_app;
GRANT SELECT, INSERT ON publication_provenance_history TO courtside_app;

CREATE FUNCTION withdraw_rights_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('REVOKED','BLOCKED') AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE publication_provenance p SET status = 'WITHDRAWN'
        FROM publication_impact_link impact WHERE p.snapshot_id = impact.snapshot_id AND impact.asset_id = NEW.asset_id;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER rights_provenance_withdrawal AFTER UPDATE ON rights_record
    FOR EACH ROW EXECUTE FUNCTION withdraw_rights_provenance();
