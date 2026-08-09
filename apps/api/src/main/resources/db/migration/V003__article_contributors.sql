-- T034/T035 contributor and byline source
--
-- Public bylines are revision-scoped so an immutable published revision keeps
-- the exact ordered contributor projection that was approved with it. No
-- private contact fields are stored in this public source.
--
-- This migration is expand-only. Public-read application connections receive
-- SELECT only; editorial writes require the separately reviewed publication
-- workflow boundary and its later migration.

CREATE TABLE contributor (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    slug text NOT NULL,
    display_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT contributor_slug_ck CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 128
    ),
    CONSTRAINT contributor_display_name_ck CHECK (
        btrim(display_name) <> ''
        AND length(display_name) <= 200
        AND display_name !~ '[[:cntrl:]]'
    ),
    CONSTRAINT contributor_version_ck CHECK (version >= 0),
    CONSTRAINT contributor_slug_uk UNIQUE (slug)
);

CREATE TABLE article_contributor (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    article_revision_id uuid NOT NULL REFERENCES article_revision (id) ON DELETE RESTRICT,
    contributor_id uuid NOT NULL REFERENCES contributor (id) ON DELETE RESTRICT,
    role text NOT NULL,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT article_contributor_role_ck CHECK (
        role IN ('AUTHOR', 'EDITOR', 'PHOTOGRAPHER', 'ILLUSTRATOR', 'TRANSLATOR', 'DESIGNER')
    ),
    CONSTRAINT article_contributor_position_ck CHECK (position > 0),
    CONSTRAINT article_contributor_version_ck CHECK (version >= 0),
    CONSTRAINT article_contributor_revision_position_uk UNIQUE (article_revision_id, position),
    CONSTRAINT article_contributor_revision_person_role_uk
        UNIQUE (article_revision_id, contributor_id, role)
);

CREATE INDEX article_contributor_revision_idx
    ON article_contributor (article_revision_id, position, id);

-- The public application role is read-only for this source. The future
-- editorial/publication workflow migration must explicitly add narrowly scoped
-- write privileges after its API, authorization and audit boundaries exist.
REVOKE ALL ON TABLE contributor, article_contributor FROM PUBLIC;
GRANT SELECT ON TABLE contributor, article_contributor TO courtside_app;
