-- T058 taxonomy and public search projection schema.
--
-- V005 is already occupied by the editorial publication gate hardening in
-- this repository. This forward-only migration intentionally uses V012 and
-- keeps taxonomy names as attributes; durable relations use UUIDs and a
-- managed term key instead of display names.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE taxonomy_term (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    term_key text NOT NULL,
    kind text NOT NULL,
    display_name text NOT NULL,
    locale text NOT NULL DEFAULT 'zh-TW',
    valid_from timestamptz NOT NULL DEFAULT transaction_timestamp(),
    valid_until timestamptz,
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT taxonomy_term_key_ck CHECK (
        btrim(term_key) <> '' AND length(term_key) <= 256
    ),
    CONSTRAINT taxonomy_term_kind_ck CHECK (
        kind IN ('LEAGUE', 'SEASON', 'TEAM', 'PLAYER', 'PERSON', 'VENUE', 'TOPIC')
    ),
    CONSTRAINT taxonomy_term_display_name_ck CHECK (
        btrim(display_name) <> ''
        AND length(display_name) <= 250
        AND display_name !~ '[[:cntrl:]]'
    ),
    CONSTRAINT taxonomy_term_locale_ck CHECK (
        locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT taxonomy_term_validity_ck CHECK (
        valid_until IS NULL OR valid_until > valid_from
    ),
    CONSTRAINT taxonomy_term_status_ck CHECK (status IN ('ACTIVE', 'RETIRED')),
    CONSTRAINT taxonomy_term_version_ck CHECK (version >= 0),
    CONSTRAINT taxonomy_term_key_uk UNIQUE (term_key)
);

CREATE INDEX taxonomy_term_active_idx
    ON taxonomy_term (kind, valid_from, valid_until, id)
    WHERE status = 'ACTIVE';

CREATE TABLE taxonomy_alias (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    term_id uuid NOT NULL REFERENCES taxonomy_term (id) ON DELETE RESTRICT,
    alias text NOT NULL,
    normalized_alias text NOT NULL,
    locale text NOT NULL DEFAULT 'zh-TW',
    valid_from timestamptz NOT NULL DEFAULT transaction_timestamp(),
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT taxonomy_alias_alias_ck CHECK (
        btrim(alias) <> '' AND length(alias) <= 250
    ),
    CONSTRAINT taxonomy_alias_normalized_ck CHECK (
        btrim(normalized_alias) <> '' AND length(normalized_alias) <= 250
    ),
    CONSTRAINT taxonomy_alias_locale_ck CHECK (
        locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT taxonomy_alias_validity_ck CHECK (
        valid_until IS NULL OR valid_until > valid_from
    ),
    CONSTRAINT taxonomy_alias_version_ck CHECK (version >= 0),
    CONSTRAINT taxonomy_alias_revision_uk UNIQUE (
        term_id, normalized_alias, locale, valid_from
    )
);

CREATE INDEX taxonomy_alias_lookup_idx
    ON taxonomy_alias (normalized_alias, locale, valid_from, valid_until, term_id);

CREATE TABLE article_taxonomy (
    article_revision_id uuid NOT NULL REFERENCES article_revision (id) ON DELETE RESTRICT,
    term_id uuid NOT NULL REFERENCES taxonomy_term (id) ON DELETE RESTRICT,
    relevance text NOT NULL DEFAULT 'SECONDARY',
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (article_revision_id, term_id),
    CONSTRAINT article_taxonomy_relevance_ck CHECK (
        relevance IN ('PRIMARY', 'SECONDARY')
    )
);

CREATE INDEX article_taxonomy_term_idx
    ON article_taxonomy (term_id, article_revision_id);

CREATE TABLE search_document (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    article_id uuid NOT NULL REFERENCES article (id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL,
    issue_id uuid NOT NULL REFERENCES publication_issue (id) ON DELETE RESTRICT,
    slug text NOT NULL,
    title text NOT NULL,
    dek text NOT NULL,
    body_text text NOT NULL DEFAULT '',
    normalized_text text NOT NULL,
    source_checksum_sha256 text NOT NULL,
    published_at timestamptz NOT NULL,
    active boolean NOT NULL DEFAULT true,
    indexed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT search_document_article_revision_fk
        FOREIGN KEY (article_id, revision_id)
        REFERENCES article_revision (article_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT search_document_slug_ck CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 128
    ),
    CONSTRAINT search_document_title_ck CHECK (
        btrim(title) <> '' AND length(title) <= 250
    ),
    CONSTRAINT search_document_dek_ck CHECK (length(dek) <= 1000),
    CONSTRAINT search_document_normalized_text_ck CHECK (
        btrim(normalized_text) <> ''
    ),
    CONSTRAINT search_document_checksum_ck CHECK (
        source_checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
    ),
    CONSTRAINT search_document_version_ck CHECK (version >= 0),
    CONSTRAINT search_document_revision_uk UNIQUE (article_id, revision_id)
);

CREATE INDEX search_document_public_order_idx
    ON search_document (published_at DESC, article_id DESC);

CREATE INDEX search_document_active_public_order_idx
    ON search_document (published_at DESC, article_id DESC)
    WHERE active;

CREATE INDEX search_document_normalized_text_trgm_idx
    ON search_document USING gin (normalized_text gin_trgm_ops);

CREATE INDEX search_document_title_trgm_idx
    ON search_document USING gin (lower(title) gin_trgm_ops);

REVOKE ALL ON TABLE taxonomy_term, taxonomy_alias, article_taxonomy, search_document FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE
    taxonomy_term, taxonomy_alias, article_taxonomy
TO courtside_app;
GRANT SELECT, INSERT, UPDATE ON TABLE search_document TO courtside_app;
