# T086 staged beta release checklist

Status: owner-dispatched control-plane implementation; release decision remains
`HOLD` until every row below has attributable evidence on one exact candidate
SHA and every frozen T085 blocker has a separately authorized adjudication.

This checklist is non-deploying. It does not change production/provider state,
read credentials or secrets, execute participant research, start Web3/T087+, set
the T086 checkbox, or remove a beta flag.

## Immutable dispatch

- Owner authorization:
  [issue #160 comment 5488168546](https://github.com/bynanci/courtside-tw/issues/160#issuecomment-5488168546)
- Protected base: `main@92773201398306b89cca7fc0b7852cb06dd4d4c7`
- Frozen T085 traceability SHA-256:
  `204662214eada892332d1ddbeab8d0b8037cfc5477d9152d6fb3a61e56832b79`
- Candidate SHA: the pull-request head or manually selected workflow head,
  verified after checkout by `scripts/ci/verify-source-head.sh`.

## Gate order

| Stage                   | Required proof                                                                                               | Failure behavior                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Control                 | Owner comment read-back, exact base/hash, unchanged T085/T086 frontier, allowlisted diff, read-only workflow | `HOLD`; do not run release mutation                                                |
| Seven-surface preflight | All seven rows below pass at the candidate SHA                                                               | `HOLD` on `FAIL`, `UNKNOWN` or missing artifact                                    |
| Stability               | Runs 1–20 pass consecutively on the same candidate SHA                                                       | Stop immediately; the sequence is invalid and restarts at run 1 on a new execution |
| Blocker read-back       | Frozen T085 blockers are zero after separately authorized adjudication                                       | `HOLD`; repository proof cannot silently adjudicate a deviation                    |
| Protected transition    | Fresh owner read-back after all other gates pass                                                             | Merge, task checkbox and beta removal remain blocked                               |

## Required surfaces

| ID                 | Exact-head check                                                                                          | Receipt                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `public-read`      | Public Home → Issue → TOC → Article browser suite                                                         | `artifacts/t086/surfaces/public-read.log`      |
| `two-role-publish` | Editor cannot publish; publisher cannot edit; publication API role transitions pass                       | `artifacts/t086/surfaces/two-role-publish.log` |
| `retry`            | Publication reliability and outbox retry/dead-letter bounds pass                                          | `artifacts/t086/surfaces/retry.log`            |
| `revision`         | Approved revision snapshot and stale-revision invalidation pass                                           | `artifacts/t086/surfaces/revision.log`         |
| `withdrawal`       | Origin/offline denial and bounded reconciliation pass                                                     | `artifacts/t086/surfaces/withdrawal.log`       |
| `backup-restore`   | T081 isolated restore verifies RPO/RTO and checksum sample                                                | `artifacts/t086/surfaces/backup-restore/`      |
| `rollback`         | T082 isolated application rollback preserves the forward schema and performs no destructive schema action | `artifacts/t086/surfaces/rollback/`            |

The heavy isolated backup/restore and rollback drills execute once for the exact
candidate. The 20-run flaky gate then repeats the bounded runtime seam covering
public read, two-role publication, retry, revision and withdrawal. All seven
surfaces are required for the final decision; the split does not waive either
isolated drill.

## Machine-readable contract

<!-- t086:checklist-contract:start -->

```json
{
  "schema_version": "courtside-t086-beta-checklist/v1",
  "task": "T086",
  "repository": "bynanci/courtside-tw",
  "authorization_ref": "https://github.com/bynanci/courtside-tw/issues/160#issuecomment-5488168546",
  "authorized_base_sha": "92773201398306b89cca7fc0b7852cb06dd4d4c7",
  "frozen_t085_traceability_sha256": "204662214eada892332d1ddbeab8d0b8037cfc5477d9152d6fb3a61e56832b79",
  "required_surfaces": [
    "public-read",
    "two-role-publish",
    "retry",
    "revision",
    "withdrawal",
    "backup-restore",
    "rollback"
  ],
  "surface_policy": {
    "exact_candidate_sha": true,
    "attributable_receipt": true,
    "any_fail_unknown_or_missing_is_hold": true
  },
  "stability_gate": {
    "required_consecutive_runs": 20,
    "ordered_runs": "1..20",
    "same_candidate_sha": true,
    "any_failure_resets_sequence": true,
    "surfaces": ["public-read", "two-role-publish", "retry", "revision", "withdrawal"]
  },
  "protected_transitions": {
    "merge_requires_release_pass": true,
    "task_checkbox_requires_release_pass": true,
    "beta_flag_removal_requires_release_pass": true,
    "owner_readback_required": true
  },
  "scope_boundaries": {
    "participant_research_executed": false,
    "web3_activated": false,
    "production_activated": false,
    "provider_configured": false,
    "credentials_or_secrets_accessed_or_changed": false,
    "external_product_writes": false,
    "t087_or_later_dispatched": false,
    "t086_task_state_changed": false,
    "beta_flag_removed": false
  }
}
```

<!-- t086:checklist-contract:end -->

## Decision and stop rules

`scripts/validate-beta-release.mjs` reports two independent values:

- `status` validates the release control plane itself.
- `release_decision` remains `HOLD` until seven-surface evidence, 20/20
  stability, zero unadjudicated blockers, and the final owner read-back all
  exist.

Do not convert `HOLD` to `PASS` by editing this document, retrying a failed run
in place, substituting proxy/AI evidence for required human evidence, or
referencing a different SHA. Two attempts with no evidence delta stop the loop
and return the blocker to issue #160.
