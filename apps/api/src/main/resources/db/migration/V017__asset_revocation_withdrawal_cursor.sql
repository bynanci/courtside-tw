-- Asset revocation must survive retries and reach already installed packages.
-- Aggregate IDs are conservative withdrawal tombstones: the existing offline
-- protocol cannot distinguish installed versions of an article or issue.
CREATE TABLE media_revocation_impact (
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (asset_id, aggregate_type, aggregate_id),
    CONSTRAINT media_revocation_impact_type_ck CHECK (aggregate_type IN ('MEDIA_ASSET', 'ARTICLE', 'ISSUE')),
    CONSTRAINT media_revocation_impact_asset_ck CHECK (aggregate_type <> 'MEDIA_ASSET' OR asset_id = aggregate_id)
);
CREATE INDEX media_revocation_impact_aggregate_idx ON media_revocation_impact (aggregate_type, aggregate_id);
CREATE TRIGGER media_revocation_impact_append_only
BEFORE UPDATE OR DELETE ON media_revocation_impact
FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();

CREATE FUNCTION bump_media_revocation_withdrawal_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.offline_withdrawal_manifest_state
    SET version = version + 1, updated_at = transaction_timestamp()
    WHERE singleton = TRUE;
    RETURN NEW;
END;
$$;
CREATE TRIGGER media_revocation_withdrawal_version_trg
AFTER INSERT ON media_revocation_impact
FOR EACH ROW EXECUTE FUNCTION bump_media_revocation_withdrawal_version();

-- Older revocations must also expire packages containing their downloaded asset.
INSERT INTO media_revocation_impact (asset_id, aggregate_type, aggregate_id)
SELECT id, 'MEDIA_ASSET', id FROM media_asset WHERE processing_state = 'REVOKED';

REVOKE ALL ON TABLE media_revocation_impact FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE media_revocation_impact TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE media_revocation_impact FROM courtside_app;
REVOKE ALL ON FUNCTION bump_media_revocation_withdrawal_version() FROM PUBLIC;
