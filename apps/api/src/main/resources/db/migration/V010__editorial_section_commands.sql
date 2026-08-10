-- T052 issue section management command scopes.
-- This is an expand-only constraint change; it does not activate production data.

ALTER TABLE publication_idempotency
    DROP CONSTRAINT publication_idempotency_operation_ck,
    ADD CONSTRAINT publication_idempotency_operation_ck CHECK (
        operation IN (
            'CREATE_ISSUE',
            'PATCH_ISSUE',
            'CREATE_SECTION',
            'PATCH_SECTION',
            'REORDER_SECTIONS',
            'DELETE_SECTION',
            'CREATE_REVISION',
            'CREATE_ARTICLE',
            'PATCH_ARTICLE',
            'REVOKE_MEDIA',
            'SUBMIT',
            'REQUEST_CHANGES',
            'APPROVE',
            'SCHEDULE',
            'PUBLISH',
            'WITHDRAW',
            'ARCHIVE'
        )
    );
