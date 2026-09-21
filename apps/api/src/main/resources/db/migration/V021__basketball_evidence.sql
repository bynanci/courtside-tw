-- Sources, snapshots, references and review/audit events are immutable.
CREATE TABLE basketball_source (
    id uuid PRIMARY KEY,
    source_type text NOT NULL CHECK (source_type IN
        ('ASSOCIATION', 'LEAGUE', 'TEAM', 'GAME_DATA', 'MEDIA', 'INTERVIEW', 'SOCIAL', 'INTERNAL_ANALYSIS')),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 500),
    source_url text NOT NULL,
    public_reference_allowed boolean NOT NULL
);
CREATE TABLE basketball_source_snapshot (
    id uuid PRIMARY KEY,
    source_id uuid NOT NULL REFERENCES basketball_source (id),
    source_url text NOT NULL,
    retrieved_at timestamptz NOT NULL,
    published_at timestamptz,
    content text NOT NULL CHECK (length(content) BETWEEN 1 AND 1000000),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    rights_reference text NOT NULL CHECK (length(btrim(rights_reference)) BETWEEN 1 AND 500),
    CHECK (published_at IS NULL OR published_at <= retrieved_at),
    CHECK (sha256 = encode(sha256(convert_to(content, 'UTF8')), 'hex'))
);
CREATE TABLE basketball_evidence_ref (
    id uuid PRIMARY KEY,
    source_id uuid NOT NULL REFERENCES basketball_source (id),
    source_type text NOT NULL,
    source_url text NOT NULL,
    retrieved_at timestamptz NOT NULL,
    published_at timestamptz,
    effective_at timestamptz,
    confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status text NOT NULL CHECK (status IN ('CONFIRMED', 'REPORTED', 'ANALYSIS', 'RUMOR', 'UNKNOWN')),
    freshness text NOT NULL CHECK (freshness IN ('fresh', 'stale', 'expired', 'disputed')),
    snapshot_id uuid NOT NULL REFERENCES basketball_source_snapshot (id),
    stale_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
    CHECK (stale_at >= retrieved_at AND expires_at >= stale_at),
    CHECK (status <> 'CONFIRMED' OR effective_at IS NOT NULL)
);
CREATE TABLE basketball_claim_revision (
    claim_key text PRIMARY KEY CHECK (claim_key ~ '^[A-Za-z0-9_.:-]{1,200}$'),
    revision integer NOT NULL CHECK (revision >= 0)
);
CREATE TABLE basketball_claim_event (
    id uuid PRIMARY KEY,
    claim_key text NOT NULL REFERENCES basketball_claim_revision (claim_key),
    revision integer NOT NULL CHECK (revision > 0),
    event_kind text NOT NULL CHECK (event_kind IN ('PROPOSED', 'REVIEWED')),
    claim_value text NOT NULL CHECK (length(btrim(claim_value)) BETWEEN 1 AND 2000),
    evidence_ids uuid[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
    status text NOT NULL CHECK (status IN ('CONFIRMED', 'REPORTED', 'ANALYSIS', 'RUMOR', 'UNKNOWN')),
    reviewer_id text,
    rationale text,
    created_at timestamptz NOT NULL,
    UNIQUE (claim_key, revision),
    CHECK (event_kind <> 'REVIEWED' OR
        (length(btrim(reviewer_id)) > 0 AND length(btrim(rationale)) BETWEEN 1 AND 1000
         AND reviewer_id IS NOT NULL AND rationale IS NOT NULL))
);
CREATE TABLE basketball_claim_event_evidence (
    event_id uuid NOT NULL REFERENCES basketball_claim_event (id),
    evidence_id uuid NOT NULL REFERENCES basketball_evidence_ref (id),
    PRIMARY KEY (event_id, evidence_id)
);

CREATE FUNCTION basketball_validate_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM basketball_source_snapshot ss
        JOIN basketball_source s ON s.id = ss.source_id
        WHERE ss.id = NEW.snapshot_id AND s.id = NEW.source_id AND s.source_type = NEW.source_type
          AND ss.source_url = NEW.source_url AND ss.retrieved_at = NEW.retrieved_at
          AND ss.published_at IS NOT DISTINCT FROM NEW.published_at
    ) THEN
        RAISE EXCEPTION 'Evidence must bind immutable snapshot metadata';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER basketball_ref_binding BEFORE INSERT ON basketball_evidence_ref
    FOR EACH ROW EXECUTE FUNCTION basketball_validate_reference();

CREATE FUNCTION basketball_validate_fact_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    evidence_id uuid;
BEGIN
    FOREACH evidence_id IN ARRAY NEW.evidence_ids LOOP
        IF NOT EXISTS (SELECT 1 FROM basketball_evidence_ref WHERE id = evidence_id) THEN
            RAISE EXCEPTION 'Canonical fact requires existing evidence';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER basketball_fact_evidence BEFORE INSERT ON basketball_fact
    FOR EACH ROW EXECUTE FUNCTION basketball_validate_fact_evidence();
CREATE TRIGGER basketball_event_evidence BEFORE INSERT ON basketball_claim_event
    FOR EACH ROW EXECUTE FUNCTION basketball_validate_fact_evidence();

CREATE TRIGGER basketball_source_immutable BEFORE UPDATE OR DELETE ON basketball_source
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();
CREATE TRIGGER basketball_snapshot_immutable BEFORE UPDATE OR DELETE ON basketball_source_snapshot
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();
CREATE TRIGGER basketball_reference_immutable BEFORE UPDATE OR DELETE ON basketball_evidence_ref
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();
CREATE TRIGGER basketball_claim_event_immutable BEFORE UPDATE OR DELETE ON basketball_claim_event
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();
CREATE TRIGGER basketball_claim_link_immutable BEFORE UPDATE OR DELETE ON basketball_claim_event_evidence
    FOR EACH ROW EXECUTE FUNCTION basketball_reject_mutation();

REVOKE ALL ON TABLE basketball_source, basketball_source_snapshot, basketball_evidence_ref,
    basketball_claim_revision, basketball_claim_event, basketball_claim_event_evidence FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE basketball_source, basketball_source_snapshot, basketball_evidence_ref,
    basketball_claim_revision, basketball_claim_event, basketball_claim_event_evidence TO courtside_app;
GRANT UPDATE (revision) ON TABLE basketball_claim_revision TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE basketball_source, basketball_source_snapshot,
    basketball_evidence_ref, basketball_claim_event, basketball_claim_event_evidence FROM courtside_app;
REVOKE DELETE, TRUNCATE ON TABLE basketball_claim_revision FROM courtside_app;
