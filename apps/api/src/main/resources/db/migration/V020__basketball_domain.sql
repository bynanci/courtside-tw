-- Additive P2A storage. No backfill, provider ingest, UI routing change or destructive rollback.
-- Stable identities are separate from names and immutable relationship facts.
CREATE TABLE basketball_identity (
    id uuid PRIMARY KEY,
    entity_kind text NOT NULL CHECK (entity_kind IN
        ('LEAGUE', 'TEAM', 'PLAYER', 'SEASON', 'COMPETITION', 'TOURNAMENT', 'GAME', 'NATIONAL_TEAM_CAMPAIGN')),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE basketball_fact (
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES basketball_identity (id),
    fact_kind text NOT NULL CHECK (fact_kind IN
        ('LEAGUE', 'TEAM', 'PLAYER', 'LEAGUE_ALIAS', 'TEAM_ALIAS', 'PLAYER_ALIAS', 'LIFECYCLE', 'SEASON', 'TEAM_SEASON',
         'PLAYER_TEAM_STINT', 'NATIONAL_TEAM_CAMPAIGN', 'NATIONAL_TEAM_ROSTER', 'ROSTER_ENTRY',
         'COMPETITION', 'TOURNAMENT', 'GAME')),
    identity_kind text,
    valid_from date,
    valid_to date,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    evidence_ids uuid[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CHECK (valid_to IS NULL OR (valid_from IS NOT NULL AND valid_to > valid_from)),
    CHECK (fact_kind = 'COMPETITION' OR valid_from IS NOT NULL),
    CHECK (identity_kind IS NULL OR (identity_kind = fact_kind AND owner_id = id))
);
CREATE INDEX basketball_fact_history_idx ON basketball_fact (owner_id, valid_from, id);

-- One transaction lock serializes low-volume editorial catalog edits without mutable facts.
CREATE TABLE basketball_catalog_lock (singleton boolean PRIMARY KEY CHECK (singleton));
INSERT INTO basketball_catalog_lock (singleton) VALUES (TRUE);

CREATE FUNCTION basketball_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Basketball identities and historical records are append-only';
END;
$$;
CREATE TRIGGER basketball_identity_immutable BEFORE UPDATE OR DELETE ON basketball_identity
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();
CREATE TRIGGER basketball_fact_immutable BEFORE UPDATE OR DELETE ON basketball_fact
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();

REVOKE ALL ON TABLE basketball_identity, basketball_fact, basketball_catalog_lock FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE basketball_identity, basketball_fact TO courtside_app;
GRANT SELECT, UPDATE ON TABLE basketball_catalog_lock TO courtside_app;
GRANT USAGE, SELECT ON SEQUENCE basketball_fact_sequence_seq TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE basketball_identity, basketball_fact FROM courtside_app;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE basketball_catalog_lock FROM courtside_app;
