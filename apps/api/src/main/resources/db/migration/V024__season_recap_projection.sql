-- Public, deterministic projections; no reader identity or activity is stored here.
CREATE TABLE season_recap_projection (
    id uuid PRIMARY KEY,
    season_id uuid NOT NULL REFERENCES basketball_identity(id),
    poster_asset_id uuid NOT NULL REFERENCES media_asset(id),
    metric text NOT NULL CHECK (metric = 'TEAM_SEASON_COVERAGE_V1'),
    fact_ids uuid[] NOT NULL CHECK (cardinality(fact_ids) BETWEEN 1 AND 32),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CHECK (payload->>'projectionId' = id::text),
    CHECK (payload->>'seasonId' = season_id::text),
    CHECK (payload->>'posterAssetId' = poster_asset_id::text)
);
CREATE TRIGGER season_recap_immutable BEFORE UPDATE OR DELETE ON season_recap_projection
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();
REVOKE ALL ON TABLE season_recap_projection FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE season_recap_projection TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE season_recap_projection FROM courtside_app;
