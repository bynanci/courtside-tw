-- FR-011: editorial library membership is independent of processing and rights.
-- Existing public snapshots and media variants remain readable after archive.
ALTER TABLE media_asset ADD COLUMN archived_at timestamptz;

CREATE INDEX media_asset_active_library_idx ON media_asset (id DESC)
    WHERE archived_at IS NULL;
CREATE INDEX media_asset_archived_library_idx ON media_asset (id DESC)
    WHERE archived_at IS NOT NULL;
