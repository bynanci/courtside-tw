-- T050/T055 expand-only command scopes for issue and revision CRUD.

ALTER TABLE publication_idempotency
    DROP CONSTRAINT publication_idempotency_operation_ck,
    ADD CONSTRAINT publication_idempotency_operation_ck CHECK (
        operation IN (
            'CREATE_ISSUE',
            'PATCH_ISSUE',
            'CREATE_REVISION',
            'CREATE_ARTICLE',
            'PATCH_ARTICLE',
            'SUBMIT',
            'REQUEST_CHANGES',
            'APPROVE',
            'SCHEDULE',
            'PUBLISH',
            'WITHDRAW',
            'ARCHIVE'
        )
    );
