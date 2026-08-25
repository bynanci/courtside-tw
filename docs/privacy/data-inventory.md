# T084 minimal product analytics data inventory

Status: bounded contract only. This document does not activate a provider, SDK, endpoint, receiver, credential, or production configuration.

## Purpose

T084 defines a minimal, consent-aware product analytics contract for public magazine interactions. Reading, searching, and sharing remain available without analytics consent.

The contract is intentionally provider-neutral. Events are eligible for a sink only after the user has explicitly granted consent. The current implementation has no configured external sink.

## Consent and failure behavior

- Consent has three states: `unknown`, `denied`, and `granted`.
- `unknown` and `denied` are strict no-ops; they emit no event and do not call the sink.
- Only explicit `granted` consent permits an allowlisted event to reach the provider-neutral sink.
- Invalid or unexpected properties are rejected before the sink.
- Sink failures are non-blocking and return a bounded `sink_failure` result.
- A consent storage read failure is treated as `unknown` consent, returns a bounded no-op, and never calls the sink.
- Explicit consent without a configured sink returns `sink_unconfigured`; it never reports the dropped event as sent.
- Consent withdrawal prevents future events. This slice collects no user identity, so historical events cannot be attributed to a person for deletion.

## Allowlisted events and fields

Only these four event types are allowed:

| Event                     | Bounded properties                                      | Allowed values                                                                                                             |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `public_issue_view`       | `surface`, `content_kind`                               | `surface=issue`; `content_kind=issue`                                                                                      |
| `public_article_view`     | `surface`, `content_kind`                               | `surface=article`; `content_kind=article`                                                                                  |
| `public_search_submitted` | `surface`, `query_length_bucket`, `result_count_bucket` | `surface=search`; query bucket is `empty`, `1_2`, `3_5`, or `6_plus`; result bucket is `zero`, `1_5`, `6_20`, or `21_plus` |
| `public_share_started`    | `surface`, `content_kind`, `share_target`               | `surface=share`; `content_kind=article`, `issue`, or `none`; target is `copy_link` or `native_share`                       |

The event contract rejects all other properties. It does not accept raw query text, slugs, titles, bodies, URLs, free text, user/session/device identifiers, IP addresses, email addresses, wallet addresses, request IDs, trace IDs, or provider-specific metadata.

## Retention and activation boundary

If a separately approved future sink is activated, its retained event data must not exceed 30 days unless a new privacy review approves a different ceiling. T084 does not create retention jobs, provider configuration, production activation, or secrets.

Any future activation must separately document:

1. the approved provider and receiver;
2. the exact consent UI and withdrawal path;
3. retention enforcement and deletion behavior;
4. dashboard access and alert ownership;
5. a re-run of the exact-head CI/Security and protected-merge gates.

## Out of scope

T084 does not change publication, search, authentication, schema, migrations, anonymous-read policy, participant research, Web3, T085 or later tasks, provider/receiver configuration, production activation, or secrets.
