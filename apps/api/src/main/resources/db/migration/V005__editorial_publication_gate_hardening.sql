-- T045 remediation: forward-only hardening for the merged V004 foundation.
--
-- V004 remains immutable. This migration binds editorial evidence to frozen
-- article revisions, records the rights row/version evaluated, accepts the
-- required BLOCKED job terminal state, and aligns job key scope with the
-- idempotency table.

ALTER TABLE publication_job
    DROP CONSTRAINT publication_job_status_ck,
    ADD CONSTRAINT publication_job_status_ck CHECK (
        status IN ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'DEAD_LETTER')
    ),
    ADD CONSTRAINT publication_job_blocked_error_ck CHECK (
        status <> 'BLOCKED' OR (last_error IS NOT NULL AND btrim(last_error) <> '')
    );

ALTER TABLE publication_job
    DROP CONSTRAINT publication_job_operation_ck,
    ADD CONSTRAINT publication_job_operation_ck CHECK (
        operation IN ('SUBMIT', 'REQUEST_CHANGES', 'APPROVE', 'SCHEDULE', 'PUBLISH', 'WITHDRAW', 'ARCHIVE')
    );

ALTER TABLE publication_idempotency
    DROP CONSTRAINT publication_idempotency_operation_ck,
    ADD CONSTRAINT publication_idempotency_operation_ck CHECK (
        operation IN ('SUBMIT', 'REQUEST_CHANGES', 'APPROVE', 'SCHEDULE', 'PUBLISH', 'WITHDRAW', 'ARCHIVE')
    );

ALTER TABLE publication_job
    DROP CONSTRAINT publication_job_idempotency_uk,
    ADD CONSTRAINT publication_job_idempotency_uk UNIQUE (
        requested_by,
        operation,
        idempotency_key
    );

ALTER TABLE publication_review
    ADD CONSTRAINT publication_review_revision_shape_ck CHECK (
        (aggregate_type = 'ARTICLE' AND revision_id IS NOT NULL)
        OR (aggregate_type = 'ISSUE' AND revision_id IS NULL)
    ),
    ADD CONSTRAINT publication_review_article_revision_fk
        FOREIGN KEY (aggregate_id, revision_id)
        REFERENCES article_revision (article_id, id)
        ON DELETE RESTRICT;

ALTER TABLE publication_rights_reference
    ADD COLUMN rights_record_id uuid REFERENCES rights_record (id) ON DELETE RESTRICT,
    ADD COLUMN rights_record_version bigint,
    ADD CONSTRAINT publication_rights_reference_revision_shape_ck CHECK (
        (aggregate_type = 'ARTICLE' AND revision_id IS NOT NULL)
        OR (aggregate_type = 'ISSUE' AND revision_id IS NULL)
    ),
    ADD CONSTRAINT publication_rights_reference_article_revision_fk
        FOREIGN KEY (aggregate_id, revision_id)
        REFERENCES article_revision (article_id, id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT publication_rights_reference_rights_evidence_ck CHECK (
        (decision_code = 'RIGHTS_MISSING' AND (
            (rights_record_id IS NULL AND rights_record_version IS NULL)
            OR (rights_record_id IS NOT NULL AND rights_record_version >= 0)
        ))
        OR (decision_code <> 'RIGHTS_MISSING'
            AND rights_record_id IS NOT NULL
            AND rights_record_version >= 0)
    );

ALTER TABLE publication_snapshot
    ADD CONSTRAINT publication_snapshot_revision_shape_ck CHECK (
        (aggregate_type = 'ARTICLE' AND revision_id IS NOT NULL)
        OR (aggregate_type = 'ISSUE' AND revision_id IS NULL)
    ),
    ADD CONSTRAINT publication_snapshot_article_revision_fk
        FOREIGN KEY (aggregate_id, revision_id)
        REFERENCES article_revision (article_id, id)
        ON DELETE RESTRICT;

CREATE INDEX publication_rights_reference_rights_record_idx
    ON publication_rights_reference (rights_record_id, rights_record_version);
