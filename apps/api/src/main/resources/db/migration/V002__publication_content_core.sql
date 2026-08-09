-- T026 Publication core
--
-- This migration introduces only the durable editorial core required by the
-- anonymous public read projection. Publication commands and editor workflow
-- remain deliberately out of scope; the application role receives no DELETE
-- or schema privileges.

CREATE TABLE publication_issue (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    issue_number integer NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    cover_asset_id uuid NOT NULL REFERENCES media_asset (id) ON DELETE RESTRICT,
    state text NOT NULL DEFAULT 'DRAFT',
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT publication_issue_number_ck CHECK (issue_number > 0),
    CONSTRAINT publication_issue_slug_ck CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 128
    ),
    CONSTRAINT publication_issue_title_ck CHECK (
        btrim(title) <> '' AND length(title) <= 250
    ),
    CONSTRAINT publication_issue_summary_ck CHECK (
        btrim(summary) <> '' AND length(summary) <= 1000
    ),
    CONSTRAINT publication_issue_state_ck CHECK (
        state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED')
    ),
    CONSTRAINT publication_issue_published_at_ck CHECK (
        state <> 'PUBLISHED' OR published_at IS NOT NULL
    ),
    CONSTRAINT publication_issue_version_ck CHECK (version >= 0),
    CONSTRAINT publication_issue_number_uk UNIQUE (issue_number),
    CONSTRAINT publication_issue_slug_uk UNIQUE (slug)
);

CREATE INDEX publication_issue_public_list_idx
    ON publication_issue (published_at DESC, id DESC)
    WHERE state = 'PUBLISHED';

CREATE TABLE issue_section (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    issue_id uuid NOT NULL REFERENCES publication_issue (id) ON DELETE RESTRICT,
    title text NOT NULL,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT issue_section_title_ck CHECK (btrim(title) <> '' AND length(title) <= 250),
    CONSTRAINT issue_section_position_ck CHECK (position > 0),
    CONSTRAINT issue_section_version_ck CHECK (version >= 0),
    CONSTRAINT issue_section_issue_position_uk UNIQUE (issue_id, position),
    CONSTRAINT issue_section_issue_id_uk UNIQUE (issue_id, id)
);

CREATE INDEX issue_section_issue_position_idx
    ON issue_section (issue_id, position, id);

CREATE TABLE article (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    slug text NOT NULL,
    state text NOT NULL DEFAULT 'DRAFT',
    published_revision_id uuid,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT article_slug_ck CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 128
    ),
    CONSTRAINT article_state_ck CHECK (
        state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED')
    ),
    CONSTRAINT article_published_at_ck CHECK (state <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT article_version_ck CHECK (version >= 0),
    CONSTRAINT article_slug_uk UNIQUE (slug)
);

CREATE INDEX article_public_idx
    ON article (published_at DESC, id DESC)
    WHERE state = 'PUBLISHED';

CREATE TABLE article_revision (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    article_id uuid NOT NULL REFERENCES article (id) ON DELETE RESTRICT,
    revision_number integer NOT NULL,
    title text NOT NULL,
    dek text NOT NULL,
    content_document jsonb NOT NULL,
    state text NOT NULL DEFAULT 'DRAFT',
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT article_revision_number_ck CHECK (revision_number > 0),
    CONSTRAINT article_revision_title_ck CHECK (btrim(title) <> '' AND length(title) <= 250),
    CONSTRAINT article_revision_dek_ck CHECK (length(dek) <= 1000),
    CONSTRAINT article_revision_document_ck CHECK (jsonb_typeof(content_document) = 'object'),
    CONSTRAINT article_revision_state_ck CHECK (
        state IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED')
    ),
    CONSTRAINT article_revision_version_ck CHECK (version >= 0),
    CONSTRAINT article_revision_article_number_uk UNIQUE (article_id, revision_number),
    CONSTRAINT article_revision_article_id_uk UNIQUE (article_id, id)
);

ALTER TABLE article
    ADD CONSTRAINT article_published_revision_owner_fk
    FOREIGN KEY (id, published_revision_id)
    REFERENCES article_revision (article_id, id)
    ON DELETE RESTRICT;

CREATE TABLE issue_article (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    issue_id uuid NOT NULL,
    section_id uuid NOT NULL,
    article_id uuid NOT NULL REFERENCES article (id) ON DELETE RESTRICT,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT issue_article_section_fk
        FOREIGN KEY (issue_id, section_id)
        REFERENCES issue_section (issue_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT issue_article_position_ck CHECK (position > 0),
    CONSTRAINT issue_article_version_ck CHECK (version >= 0),
    CONSTRAINT issue_article_issue_article_uk UNIQUE (issue_id, article_id),
    CONSTRAINT issue_article_section_position_uk UNIQUE (section_id, position)
);

CREATE INDEX issue_article_issue_section_position_idx
    ON issue_article (issue_id, section_id, position, id);

REVOKE ALL ON TABLE publication_issue, issue_section, article, article_revision, issue_article FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE publication_issue, issue_section, article, article_revision, issue_article TO courtside_app;
