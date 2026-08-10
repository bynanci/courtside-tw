-- T043 Editorial API and persistence foundation.
--
-- This migration adds only the durable boundaries needed by the first HTTP
-- slice: idempotent create/edit commands and explicit revision-media links so
-- the publication gate can evaluate rights without parsing arbitrary content.
-- Upload intent/completion remains T048.

ALTER TABLE publication_idempotency
    DROP CONSTRAINT publication_idempotency_operation_ck,
    ADD CONSTRAINT publication_idempotency_operation_ck CHECK (
        operation IN (
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

CREATE TABLE article_revision_media (
    article_revision_id uuid NOT NULL REFERENCES article_revision (id) ON DELETE RESTRICT,
    asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    required_channel text NOT NULL,
    position integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT article_revision_media_channel_ck CHECK (
        required_channel IN ('PUBLIC_WEB', 'READER_LIBRARY', 'OFFLINE', 'PROVENANCE')
    ),
    CONSTRAINT article_revision_media_position_ck CHECK (position > 0),
    CONSTRAINT article_revision_media_revision_asset_uk UNIQUE (
        article_revision_id, asset_id, required_channel
    )
);

CREATE INDEX article_revision_media_order_idx
    ON article_revision_media (article_revision_id, position, asset_id);

REVOKE ALL ON TABLE article_revision_media FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE article_revision_media TO courtside_app;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE article_revision_media FROM courtside_app;
