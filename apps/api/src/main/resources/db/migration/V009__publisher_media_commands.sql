-- T055 publisher media revocation command scope.

ALTER TABLE publication_idempotency
    DROP CONSTRAINT publication_idempotency_operation_ck,
    ADD CONSTRAINT publication_idempotency_operation_ck CHECK (
        operation IN (
            'CREATE_ISSUE',
            'PATCH_ISSUE',
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
