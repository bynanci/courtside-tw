-- Offline withdrawal clients need a monotonic cursor that changes whenever
-- withdrawal membership changes. Entity version maxima are not a valid cursor:
-- an older entity can be newly withdrawn below an unrelated high-water mark.

CREATE TABLE offline_withdrawal_manifest_state (
    singleton boolean PRIMARY KEY DEFAULT TRUE,
    version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT offline_withdrawal_manifest_singleton_ck CHECK (singleton),
    CONSTRAINT offline_withdrawal_manifest_version_ck CHECK (version >= 1)
);

INSERT INTO offline_withdrawal_manifest_state (singleton, version)
VALUES (TRUE, 1);

CREATE FUNCTION bump_offline_withdrawal_manifest_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    was_withdrawn boolean := FALSE;
    is_withdrawn boolean := FALSE;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        was_withdrawn := OLD.state IN ('WITHDRAWN', 'ARCHIVED');
    END IF;
    IF TG_OP <> 'DELETE' THEN
        is_withdrawn := NEW.state IN ('WITHDRAWN', 'ARCHIVED');
    END IF;

    IF was_withdrawn IS DISTINCT FROM is_withdrawn THEN
        UPDATE public.offline_withdrawal_manifest_state
        SET version = version + 1,
            updated_at = transaction_timestamp()
        WHERE singleton = TRUE;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER publication_issue_offline_withdrawal_version_trg
AFTER INSERT OR UPDATE OF state OR DELETE ON publication_issue
FOR EACH ROW EXECUTE FUNCTION bump_offline_withdrawal_manifest_version();

CREATE TRIGGER article_offline_withdrawal_version_trg
AFTER INSERT OR UPDATE OF state OR DELETE ON article
FOR EACH ROW EXECUTE FUNCTION bump_offline_withdrawal_manifest_version();

CREATE TRIGGER article_revision_offline_withdrawal_version_trg
AFTER INSERT OR UPDATE OF state OR DELETE ON article_revision
FOR EACH ROW EXECUTE FUNCTION bump_offline_withdrawal_manifest_version();

REVOKE ALL ON TABLE offline_withdrawal_manifest_state FROM PUBLIC;
GRANT SELECT ON TABLE offline_withdrawal_manifest_state TO courtside_app;

REVOKE ALL ON FUNCTION bump_offline_withdrawal_manifest_version() FROM PUBLIC;
