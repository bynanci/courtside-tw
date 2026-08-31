# Stage A GO / HOLD / CANCEL receipt template

**Template state**: `NEEDS_HUMAN / HOLD / NOT_RUN`<br>
**Evidence state**: no participant evidence<br>
**Decision scope**: `STAGE_A_PRETEST_PROGRESSION`

Copy this file to a new versioned receipt in approved restricted storage after the cohort is frozen. Never overwrite this template and never commit the completed working receipt. Before six valid human sessions exist, preserve the safe defaults above and do not populate metric results with simulated zeros. A public receipt may be generated only after the withdrawal cutoff from the aggregate allowlist in section 10.

## 1. Decision

| Field | Value |
| --- | --- |
| Research ID | `[REQUIRED]` |
| Receipt ID / version | `[REQUIRED]` |
| As of | `[REQUIRED: RFC3339]` |
| Study status | `[NOT_RUN / IN_PROGRESS / COMPLETE / CANCELLED]` |
| Decision | `[HOLD / GO / CANCEL]` |
| Decision scope | `STAGE_A_PRETEST_PROGRESSION` |
| Accountable research owner | `[REQUIRED: human role/identity in controlled record]` |
| Independent reviewer | `[REQUIRED: human role/identity in controlled record]` |
| Decision summary | `[REQUIRED: evidence-bound statement]` |

Safe pre-execution statement:

> `HOLD`: Stage A has not been executed. No consent record, participant dataset, measured T1/T2 result, or human decision evidence exists.

## 2. Scope and authority

### Included

- Six-person moderated Stage A pretest.
- T1 specified-article discovery/read start.
- T2 unaided product classification after standardized exposure.
- Preregistered descriptive metrics, uncertainty, counter-evidence, and limitations.

### Excluded / not authorized

- Recruitment or contact not separately approved by the accountable owner.
- Automated, simulated, AI, multi-agent, or test-account substitutions for participants.
- T3–T6, Stage B, retention, payment, provider failure, wallet, Web3, or production research.
- Production/provider/secret changes, external writes, product release, or issue closure.
- Population, market, commercial-value, product-market-fit, or causal claims.

## 3. Frozen prototype and method

| Field | Frozen value | Evidence reference |
| --- | --- | --- |
| Repository | `bynanci/courtside-tw` | `[REQUIRED]` |
| Prototype commit SHA | `[REQUIRED: 40 characters]` | `[REQUIRED]` |
| Tree/build/deployment ID | `[REQUIRED]` | `[REQUIRED]` |
| Environment / URL | `[REQUIRED]` | `[REQUIRED]` |
| Variant | `A` | `[REQUIRED]` |
| Target article ID/title | `[REQUIRED]` | `[REQUIRED]` |
| Entry state | `[REQUIRED]` | `[REQUIRED]` |
| Locale / device / browser / input policy | `[REQUIRED]` | `[REQUIRED]` |
| Protocol version | `[REQUIRED]` | `[REQUIRED]` |
| Task-card version | `[REQUIRED]` | `[REQUIRED]` |
| Consent version | `[REQUIRED]` | `[REQUIRED: private reference only]` |
| Optional-permission version | `[REQUIRED]` | `[REQUIRED: private reference only]` |
| Common exposure instruction / response window | `[REQUIRED: frozen version / 120s]` | `[REQUIRED]` |
| Cohort freeze time | `[REQUIRED: RFC3339]` | `[REQUIRED]` |

### Freeze integrity

- [ ] Every retained session used the same frozen values.
- [ ] Any differing build/session was quarantined and not pooled.
- [ ] No prototype or acceptance rule changed after results were visible.
- [ ] Segment attributes came from the frozen study-independent blinded source, and no direct invitation/screener/consent cue exposed the T2 domain or classification labels.

## 4. Participant flow

This participant-flow section is private working evidence. Do not place PII or a linkage table in it, and do not copy small-cell segment/replacement details into a public receipt.

| Count | Value | Evidence reference |
| --- | ---: | --- |
| `n_screened` | `[integer or null before run]` | `[private aggregate ref]` |
| `n_eligible` | `[integer or null before run]` | `[private aggregate ref]` |
| `n_consented` | `[integer or null before run]` | `[private aggregate ref]` |
| `n_started` | `[integer or null before run]` | `[restricted ref]` |
| `n_withdrawn` | `[integer or null before run]` | `[restricted aggregate ref]` |
| `n_invalidated` | `[integer or null before run]` | `[review refs]` |
| `n_retained` | `[integer or null before run]` | `[restricted analysis ref]` |
| Unique real participants represented | `[integer or null before run]` | `[human verification ref]` |
| Automated/simulated participant rows | `[null before run; must be 0]` | `[validation ref]` |

### Segment quota read-back

| Segment | Required n | Retained n |
| --- | ---: | ---: |
| `DEEP_TW_BASKETBALL_READER` | 2 | `[null before run]` |
| `GENERAL_TW_BASKETBALL_FAN` | 2 | `[null before run]` |
| `GENERAL_SPORTS_READER` | 1 | `[null before run]` |
| `WEB3_FAMILIAR_STRESS` | 1 | `[null before run]` |

List every replacement and its predeclared reason without identity: `[REQUIRED or NONE]`.

## 5. Preregistered metric read-back

Keep values `null` until real, retained participant data is analyzed. Never convert missing evidence to zero or a pass.

Use `NOT_RUN` only before any session starts. Use `INCOMPLETE` after execution begins whenever a required denominator is below six, a row is quarantined, or a withdrawal reopens the cohort; keep result values null and do not compute PASS/FAIL. Use `PASS`/`FAIL` only at the complete frozen denominator, and `INVALID` only when the metric evidence cannot be used under a cancellation/invalidation disposition.

| Metric | Numerator / raw values | Denominator | Result | 95% exact interval / spread | Gate | Outcome |
| --- | --- | ---: | ---: | --- | --- | --- |
| T1 independent success | `[null before run]` | `[null before run; must be 6]` | `[null]` | `[null]` | `>=90%; at n=6 requires 6/6` | `[NOT_RUN / INCOMPLETE / PASS / FAIL / INVALID]` |
| T1 activations | `[null before run; list six sorted values]` | `[null; must be 6 after T1 6/6]` | `[median null]` | `[min/max null]` | `median <=3` | `[NOT_RUN / INCOMPLETE / PASS / FAIL / NOT_EVALUATED]` |
| T2 unaided recognition | `[null before run]` | `[null before run; must be 6]` | `[null]` | `[null]` | `>=80%; at n=6 requires >=5/6` | `[NOT_RUN / INCOMPLETE / PASS / FAIL / INVALID]` |

### T2 completion and timing counts

| Outcome | Private count |
| --- | ---: |
| `SCORED_ON_TIME` | `[null before run]` |
| `FAIL_EARLY_PROMPT` | `[null before run]` |
| `FAIL_LATE_PROMPT` | `[null before run]` |
| `FAIL_TASK_REFUSED` | `[null before run]` |
| `FAIL_EARLY_DEPARTURE` | `[null before run]` |
| `FAIL_PARTICIPANT_BREAK` | `[null before run]` |
| `FAIL_PRODUCT_FAILURE` | `[null before run]` |
| `FAIL_EXPOSURE_DEVIATION` | `[null before run]` |
| `FAIL_CLASSIFICATION_CONTAMINATION` | `[null before run]` |
| `INVALIDATION_REVIEW` | `[null before run]` |
| `WITHDRAWN` | `[null before run]` |
| `HOLD_FOR_WITHDRAWAL_CLARIFICATION` | `[null before run]` |
| `HOLD_FOR_EXPOSURE_VALIDITY_REVIEW` | `[null before run]` |

Every `FAIL_*` row remains in the T2 denominator with recognition `false`, coding status `NOT_APPLICABLE_NON_SCORED`, and null classification/reviewer fields. Only a verified external invalidation or valid withdrawal can remove the row and require replacement; unresolved stop intent is quarantined and forces `HOLD`.

### Classification counts

These counts include `SCORED_ON_TIME` rows only and must sum to the `SCORED_ON_TIME` count. Non-scored retained rows are represented in the outcome table, not fabricated as a classification.

| Code | Count |
| --- | ---: |
| `MAGAZINE` | `[null before run]` |
| `ARCHIVE` | `[null before run]` |
| `NEWS_FEED` | `[null before run]` |
| `MEMBERSHIP` | `[null before run]` |
| `CRYPTO_PRODUCT` | `[null before run]` |
| `OTHER` | `[null before run]` |
| `UNCLEAR_OR_NO_RESPONSE` | `[null before run]` |

### Coding-status counts

Across a complete retained cohort these counts must sum to six. `RESOLVED` applies only to independently coded `SCORED_ON_TIME` rows; `NOT_APPLICABLE_NON_SCORED` applies to terminal retained `FAIL_*` rows. Any pending/unresolved row forces `HOLD`.

| Status | Count |
| --- | ---: |
| `PENDING_INDEPENDENT_REVIEW` | `[null before run]` |
| `RESOLVED` | `[null before run]` |
| `UNRESOLVED_HOLD` | `[null before run]` |
| `NOT_APPLICABLE_NON_SCORED` | `[null before run]` |

## 6. Missing values, exclusions, deviations, and incidents

| Ref | Type | Factual record | Treatment | Human reviewer | Evidence |
| --- | --- | --- | --- | --- | --- |
| `[none before run]` | `[WITHDRAWAL / INVALIDATION / FAILURE / DEVIATION / INCIDENT]` |  | `[INCLUDE / EXCLUDE_AND_REPLACE / HOLD / CANCEL]` |  |  |

Required checks:

- [ ] Every retained task failure remains in its denominator.
- [ ] Every exclusion matches a preregistered reason and has independent evidence-backed review.
- [ ] No participant was replaced for an unfavorable outcome.
- [ ] Withdrawal/deletion handling matches the consent version.
- [ ] Deletion-resolution linkage remained available through the withdrawal cutoff.
- [ ] Artifact inventory/deletion log covers completed screeners, pre-screener acknowledgments, study-specific source extracts/linkage, derived eligibility/segment/quota assignments, recordings, transcripts, T2 verbatim text, notes, rows, pre-cutoff receipts, caches, and backups; restore-time deletion replay is verified.
- [ ] Upstream reusable panel/omnibus data remains governed by its original notice/owner/deletion route, while this study's extract/linkage follows the Stage A deletion rule.
- [ ] Every optional permission state/scope/version is auditable; no recording occurred without `GRANTED` permission.
- [ ] This working receipt remained private through the withdrawal cutoff.
- [ ] No unresolved consent, privacy, assistance, coding, or freeze-integrity incident exists.

## 7. Evidence manifest

| Evidence | Class | Location/reference | State | Public-repo rule |
| --- | --- | --- | --- | --- |
| Protocol and denominator rules | `RESEARCH_METHOD` | `[commit/path]` | `[FROZEN / CHANGED]` | Allowed |
| Prototype/build proof | `IMPLEMENTATION_EVIDENCE` | `[commit/deployment ref]` | `[VERIFIED / MISSING]` | Sanitized ref only |
| Screener aggregate and quota proof | `HUMAN_SCREENING_AGGREGATE` | `[private ref]` | `[VERIFIED / MISSING]` | Restricted; suppress public cells below 3 |
| Consent records | `HUMAN_CONSENT_RECORD` | `[private ref]` | `[VERIFIED / MISSING]` | Never commit artifact/linkage |
| Pseudonymous observation set | `PARTICIPANT_OBSERVATION` | `[restricted ref/digest]` | `[VERIFIED / MISSING]` | Restricted; never commit a completed row |
| Row-level analysis | `PARTICIPANT_OBSERVATION` | `[restricted ref/digest]` | `[VERIFIED / MISSING]` | Restricted; never commit the completed CSV |
| Aggregate analysis | `PARTICIPANT_AGGREGATE` | `[private/public aggregate ref]` | `[VERIFIED / MISSING]` | Public only after cutoff + allowlist review |
| Rehearsal/automation/AI review | `SIMULATED_EXPERIENCE` | `[optional ref]` | `[SUPPORTING / NONE]` | Must remain separate |
| Behavioral event stream | `BEHAVIORAL_EVENT` | `NOT COLLECTED` | `PROHIBITED_STAGE_A` | No Stage A event rows exist |

### Participant-evidence integrity declaration

- [ ] All participant rows came from unique, consented real people.
- [ ] No automated test, browser run, screenshot, simulation, AI, multi-agent, team-member role-play, or synthetic persona was counted in a participant numerator or denominator.
- [ ] Supporting evidence was not relabeled as a participant finding.

## 8. Findings, counter-evidence, and limits

Do not complete this section before real sessions exist.

### Findings supported by this cohort

- `[null before run]`

### Counter-evidence

- `[null before run; required after run even when NONE OBSERVED]`

### Alternative explanations

- `[null before run]`

### Limitations

- P0 diagnostic evidence from six participants only; no market demand, adoption, population usability, retention, revenue, or product-market-fit inference.
- `[REQUIRED after run: segment, device, environment, moderation, measurement, missingness, and uncertainty limits]`

### Claims this receipt does not support

- `[REQUIRED: explicit list]`

## 9. Deterministic decision check

| Condition | Read-back |
| --- | --- |
| Six retained, consented, unique real people | `[true / false / unknown]` |
| Frozen build/method integrity | `[true / false / unknown]` |
| T1 6/6 | `[true / false / unknown]` |
| T1 median activations <=3 | `[true / false / unknown]` |
| T2 at least 5/6 | `[true / false / unknown]` |
| Every T2 timing/non-completion row has the preregistered disposition | `[true / false / unknown]` |
| Every T2 exposure-validity disposition matches the frozen matrix | `[true / false / unknown]` |
| T2 coding used locked verbatim text; non-scored classification fields are null | `[true / false / unknown]` |
| No unresolved consent/withdrawal/exposure-validity/integrity/privacy/coding blocker | `[true / false / unknown]` |
| Counter-evidence and limitations reviewed | `[true / false / unknown]` |
| Required owner/method/privacy sign-offs complete without objection | `[true / false / unknown]` |

Apply strict precedence: first `CANCEL` if any cancellation predicate in the denominator rules is true; otherwise `HOLD` if any row above is false or unknown; otherwise `GO`. Human sign-off is part of the function and may conservatively block progression, but no reviewer may promote a computed `HOLD` or `CANCEL` to `GO`.

## 10. Public aggregate allowlist and publication gate

The completed working receipt remains private. A separate public receipt is allowed only after all are true:

- [ ] The disclosed withdrawal cutoff passed.
- [ ] Every timely withdrawal/deletion request was applied across the private artifact inventory and restore-time deletion list.
- [ ] Linkage is no longer needed for timely requests and was handled under the disclosed rule.
- [ ] An accountable privacy reviewer verified the exact aggregate payload.
- [ ] Every public categorical cell below 3 is suppressed or combined as `OTHER/UNREPORTED`.
- [ ] The payload contains no row or cross-tab that can single out a participant.

The preregistered overall T1/T2 numerator over six is the only small-count exception because it is the primary cohort-level endpoint and has no subgroup linkage. The suppression rule still applies to segment, exclusion, replacement, timing, deviation, reason, and classification-category cells.

### Allowed public fields

- Research/protocol/receipt version and frozen prototype commit/build/environment class; omit private URLs and exact session times.
- Aggregate `GO/HOLD/CANCEL`, decision scope, owner role, and decision date.
- Overall `n_retained`, T1 success `x/6` + rate + exact interval, T1 activation median/range, and T2 recognition `x/6` + rate + exact interval.
- Aggregate timing/deviation/participant-flow counts only when the cell-size rule is satisfied.
- Non-identifying counter-evidence themes supported at aggregate level, limitations, claims not supported, and evidence digests; omit distinctive stories or quotes.
- The declaration that automated/simulated participant rows equal zero.

### Prohibited public fields

- Participant/session/recruitment keys, linkage, consent records or permission choices.
- Completed screeners, observation sheets, analysis CSV rows, per-action traces, precise timing, reading history, or private evidence paths.
- Segment/date/device/browser/input/accommodation cross-tabs or any small cell below 3.
- Participant paraphrases, restricted verbatim response text, quotations, distinctive anecdotes, recordings, transcripts, screenshots, or individual reason codes.
- Contact, compensation, identity, authentication, payment, wallet, location, IP/device identifiers, or backup/deletion-log details.

If the aggregate cannot meet this allowlist, keep it private. Git history is not a deletion-capable working research store.

## 11. Human decision and next action

### Decision rationale

`[REQUIRED: connect the decision to exact counts, uncertainty, counter-evidence, limits, and integrity checks]`

### Permitted next action

`[REQUIRED: one bounded action within current authority]`

### Explicitly still blocked

- Recruitment/contact beyond separately approved research operations.
- Stage B and T3–T6 until each surface is operable and separately authorized.
- Web3/provider/wallet/payment/production changes.
- Market or commercial-value claims.
- Issue #110 closure unless all separately required evidence exists.

### Sign-off

| Role | Decision | Date/time | Receipt/evidence reference |
| --- | --- | --- | --- |
| Accountable research owner | `[GO / HOLD / CANCEL]` | `[RFC3339]` | `[REQUIRED]` |
| Independent method/evidence reviewer | `[CONCUR / OBJECT / NEEDS_CHANGES]` | `[RFC3339]` | `[REQUIRED]` |
| Privacy/consent reviewer | `[CLEAR / BLOCK]` | `[RFC3339]` | `[REQUIRED]` |

## 12. Machine-readable private-working summary

Keep `null` values and the safe `HOLD` state until real evidence exists.

```json
{
  "researchId": null,
  "receiptVersion": null,
  "asOf": null,
  "status": "NEEDS_HUMAN",
  "studyStatus": "NOT_RUN",
  "decisionScope": "STAGE_A_PRETEST_PROGRESSION",
  "decision": "HOLD",
  "schema": {
    "binaryMetricResultEnum": ["NOT_RUN", "INCOMPLETE", "PASS", "FAIL", "INVALID"],
    "activationMetricResultEnum": ["NOT_RUN", "INCOMPLETE", "PASS", "FAIL", "NOT_EVALUATED"]
  },
  "prototype": {
    "commit": null,
    "buildId": null,
    "environment": null,
    "variant": "A",
    "targetArticleId": null
  },
  "participants": {
    "screened": null,
    "eligible": null,
    "consented": null,
    "started": null,
    "withdrawn": null,
    "invalidated": null,
    "retained": null,
    "realUniqueParticipants": null,
    "automatedOrSimulatedRows": null,
    "requiredAutomatedOrSimulatedRows": 0
  },
  "metrics": {
    "t1Success": {
      "numerator": null,
      "denominator": null,
      "rate": null,
      "exact95Ci": null,
      "gate": ">=90% and 6/6 at n=6",
      "result": "NOT_RUN"
    },
    "t1Activations": {
      "valuesSorted": null,
      "median": null,
      "minimum": null,
      "maximum": null,
      "gate": "median <=3 after T1 is 6/6",
      "result": "NOT_RUN"
    },
    "t2Recognition": {
      "numerator": null,
      "denominator": null,
      "rate": null,
      "exact95Ci": null,
      "codingStatusCounts": {
        "pendingIndependentReview": null,
        "resolved": null,
        "unresolvedHold": null,
        "notApplicableNonScored": null
      },
      "gate": ">=80% and >=5/6 at n=6",
      "result": "NOT_RUN"
    },
    "t2Outcomes": {
      "scoredOnTime": null,
      "failEarlyPrompt": null,
      "failLatePrompt": null,
      "failTaskRefused": null,
      "failEarlyDeparture": null,
      "failParticipantBreak": null,
      "failProductFailure": null,
      "failExposureDeviation": null,
      "failClassificationContamination": null,
      "invalidationReview": null,
      "withdrawn": null,
      "holdForWithdrawalClarification": null,
      "holdForExposureValidityReview": null
    }
  },
  "evidence": [],
  "counterEvidence": [],
  "limitations": [
    "P0 diagnostic evidence from six participants only; no population or market inference"
  ],
  "reasons": [
    "No participant data collected yet"
  ],
  "nextAction": "Complete readiness placeholders and obtain accountable approval before recruitment"
}
```
