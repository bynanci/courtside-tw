-- Additive P2D records. No backfill, provider, signer or chain writes.
CREATE TABLE fan_passport_entitlement (
    id uuid PRIMARY KEY,
    reader_id uuid REFERENCES reader_profile(id) ON DELETE RESTRICT,
    issue_id uuid REFERENCES publication_issue(id) ON DELETE RESTRICT,
    season text NOT NULL CHECK (season ~ '^[0-9]{4}$'),
    condition_code text NOT NULL CHECK (condition_code = 'ISSUE_PROGRESS_ACK_V1'),
    erased_at timestamptz,
    UNIQUE (reader_id, issue_id, season, condition_code)
);
CREATE TABLE fan_passport_stamp (
    id uuid PRIMARY KEY,
    entitlement_id uuid NOT NULL REFERENCES fan_passport_entitlement(id),
    snapshot_id uuid REFERENCES publication_snapshot(id),
    status text NOT NULL CHECK (status IN ('CLAIMABLE','CLAIMED','REVOKED','SUPERSEDED','EXPIRED')),
    issued_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
    superseded_by uuid REFERENCES fan_passport_stamp(id) DEFERRABLE INITIALLY DEFERRED,
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE UNIQUE INDEX fan_passport_effective_stamp_uk ON fan_passport_stamp(entitlement_id)
    WHERE status IN ('CLAIMABLE', 'CLAIMED');
CREATE TABLE fan_passport_command (
    reader_id uuid NOT NULL REFERENCES reader_profile(id),
    key_digest text NOT NULL CHECK (key_digest ~ '^[0-9a-f]{64}$'),
    request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    stamp_id uuid NOT NULL REFERENCES fan_passport_stamp(id),
    PRIMARY KEY (reader_id, key_digest)
);
CREATE TABLE fan_passport_history (
    id uuid PRIMARY KEY,
    stamp_id uuid NOT NULL REFERENCES fan_passport_stamp(id),
    status text NOT NULL CHECK (status IN ('CLAIMABLE','CLAIMED','REVOKED','SUPERSEDED','EXPIRED')),
    reason text NOT NULL CHECK (reason IN ('ELIGIBILITY_ACKNOWLEDGED','OWNER_REVOCATION','RIGHTS_WITHDRAWAL','REPLACEMENT','EXPIRATION','ACCOUNT_ERASURE')),
    actor_type text NOT NULL CHECK (actor_type IN ('READER','PUBLISHER','SYSTEM')),
    effective_at timestamptz NOT NULL
);
CREATE TRIGGER fan_passport_history_append_only BEFORE UPDATE OR DELETE ON fan_passport_history
    FOR EACH ROW EXECUTE FUNCTION reject_publication_append_only_mutation();
CREATE TABLE wallet_identity_link (
    id uuid PRIMARY KEY,
    reader_id uuid NOT NULL REFERENCES reader_profile(id),
    chain_namespace text NOT NULL CHECK (chain_namespace = 'eip155'),
    address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
    linked_at timestamptz NOT NULL,
    UNIQUE (chain_namespace, address)
);
CREATE TABLE siwe_challenge (
    nonce_digest text PRIMARY KEY CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
    reader_id uuid NOT NULL REFERENCES reader_profile(id),
    key_digest text NOT NULL,
    request_digest text NOT NULL,
    message_digest text NOT NULL,
    address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
    chain_id text NOT NULL,
    issued_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
    consumed_at timestamptz,
    UNIQUE(reader_id, key_digest)
);
REVOKE ALL ON fan_passport_entitlement, fan_passport_stamp, fan_passport_command,
    fan_passport_history, wallet_identity_link, siwe_challenge FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON fan_passport_entitlement, fan_passport_stamp TO courtside_app;
GRANT SELECT, INSERT ON fan_passport_history TO courtside_app;
GRANT SELECT, INSERT, DELETE ON fan_passport_command TO courtside_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON wallet_identity_link, siwe_challenge TO courtside_app;
