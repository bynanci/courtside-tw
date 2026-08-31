# Stage A participant observation sheet

**Status**: BLANK TEMPLATE / NOT PARTICIPANT EVIDENCE<br>
**Handling**: restricted working copy only; completed copies must never be committed<br>
**Evidence label after a valid human session**: `PARTICIPANT_OBSERVATION`

Copy this file once per retained, consented real participant. Do not overwrite the template. A completed copy always remains in the approved restricted research store. Public output is aggregate-only under the receipt allowlist; there is no row-level public export.

## 1. Session identity and freeze

| Field | Value |
| --- | --- |
| Research ID | `[REQUIRED]` |
| Protocol / task-card version | `[REQUIRED]` |
| Participant key | `[REQUIRED: random research pseudonym]` |
| Session key | `[REQUIRED: random research pseudonym]` |
| Primary segment | `[DEEP_TW_BASKETBALL_READER / GENERAL_TW_BASKETBALL_FAN / GENERAL_SPORTS_READER / WEB3_FAMILIAR_STRESS]` |
| Variant | `A` |
| Prototype commit SHA | `[REQUIRED: 40 characters]` |
| Build/deployment ID | `[REQUIRED]` |
| Environment / entry URL | `[REQUIRED]` |
| Target article stable ID | `[REQUIRED]` |
| Target article title | `[REQUIRED]` |
| Target article direct URL used for standardized exposure | `[REQUIRED]` |
| Session date | `[YYYY-MM-DD; restricted record only]` |
| Moderator role/key | `[REQUIRED: no unnecessary personal identifier]` |
| Observer role/key | `[REQUIRED or NONE]` |
| Device/browser/input mode | `[REQUIRED: bounded study configuration]` |
| Agreed accommodation | `[NONE or non-identifying description]` |

### Freeze verification

- [ ] Commit, build, environment, variant, target article, locale, task cards, and entry state match the cohort freeze.
- [ ] A clean demo profile was used; no real account, wallet, payment, or personal data was required.
- [ ] No material configuration changed during the session.

If any answer is false, stop scoring and open an invalidation review. Do not decide exclusion from aggregate results alone.

## 2. Consent verification

The consent artifact and identity linkage remain in the private system. This sheet stores only minimum-necessary verification state.

| Field | Value |
| --- | --- |
| Participation consent verified before observation | `[true / false]` |
| Consent version | `[REQUIRED]` |
| Optional-permission version | `[REQUIRED]` |
| Audio recording state | `[NOT_ASKED / DECLINED / GRANTED / REVOKED]` |
| Screen recording state | `[NOT_ASKED / DECLINED / GRANTED / REVOKED]` |
| De-identified report-quote state | `[NOT_ASKED / DECLINED / GRANTED / REVOKED]` |
| Permission scope / granted-revoked time ref | `[restricted consent-system reference]` |
| Stop/withdrawal disposition | `[NONE / STOPPED_RETAIN_DATA / WITHDRAWN_DELETE_DATA / HOLD_FOR_WITHDRAWAL_CLARIFICATION]` |
| Consent disposition | `[VALID_BEFORE_EXPOSURE / NO_CONSENT_BEFORE_EXPOSURE / OBSERVED_WITHOUT_VALID_CONSENT / WITHDRAWN_VALID_CONSENT]` |

- `NO_CONSENT_BEFORE_EXPOSURE`: do not create this sheet or expose the prototype; record only the aggregate screening disposition and allow a replacement.
- `OBSERVED_WITHOUT_VALID_CONSENT`: stop, quarantine/delete every affected artifact, open a privacy/consent incident, and `CANCEL` the affected run. Do not reuse the data or silently replace the person.
- `WITHDRAWN_VALID_CONSENT`: stop, cascade deletion through the private artifact inventory, remove the row, reopen any pre-cutoff receipt, and require a valid replacement.
- `STOPPED_RETAIN_DATA`: retain only data covered by participation consent and apply the affected terminal task-failure code.
- `HOLD_FOR_WITHDRAWAL_CLARIFICATION`: quarantine the row; do not infer retention, deletion, or failure until the disclosed clarification route resolves it.
- `REVOKED` optional media permission stops/deletes that medium and its derivatives; manual observations remain only while participation consent is valid. Any recording without `GRANTED` permission opens an incident and `CANCEL`s the affected run.
- Only `VALID_BEFORE_EXPOSURE` permits task scoring.

## 3. T1 observation — find and start the target article

### Outcome

| Field | Value |
| --- | --- |
| T1 completion signal before 180.000 seconds | `[true / false / null while withdrawal clarification]` |
| T1 elapsed seconds, rounded to nearest 5 | `[0..180 / >180 / null]` |
| Outcome code | `[SUCCESS / FAIL_TIMEOUT / FAIL_GIVE_UP / FAIL_ABANDONED / ASSISTED_FAIL / PRODUCT_FAILURE / INVALIDATION_REVIEW / WITHDRAWN / HOLD_FOR_WITHDRAWAL_CLARIFICATION]` |
| Independent success | `[true / false / null while under review]` |
| Activation count | `[non-negative integer / null while withdrawal clarification]` |
| Wrong-turn count | `[non-negative integer / null while withdrawal clarification]` |
| Completion signal source | `[VERBAL_DONE / TEXT_DONE / APPROVED_ACCESSIBLE_SIGNAL / NONE / null while withdrawal clarification]` |
| Frozen title/body readable at signal | `[true / false / null]` |
| Neutral prompt 1 count | `[0 / 1 / null while withdrawal clarification]` |
| Neutral prompt 2 count | `[0 / 1 / null while withdrawal clarification]` |
| Participant-requested task-card reread count | `[0 / 1 / null while withdrawal clarification]` |
| Prohibited moderator assistance | `[true / false / null while withdrawal clarification]` |
| Contamination boundary | `[BEFORE_FIRST_ACTIVATION / AFTER_FIRST_ACTIVATION / NOT_APPLICABLE / null while withdrawal clarification]` |
| Product/system failure | `[NONE / fixed reason code / null while withdrawal clarification]` |

For `HOLD_FOR_WITHDRAWAL_CLARIFICATION`, keep the outcome code at that quarantine state. Isolate factual fields already captured under valid consent, collect nothing further, and treat every scoring field as null in analysis until intent resolves; do not fabricate missing notes or infer a failure. Delete the quarantined artifact if withdrawal is later confirmed.

### Minimum-necessary route summary

Do not record per-action timestamps, exact reading history, or a full browsing trace. Retain only the gate-required counts plus standardized diagnostic codes.

- Standardized surface sequence: `[HOME / ISSUE / TOC / ARTICLE / OTHER]` (no timestamps or unrelated browsing detail)
- Wrong-turn reason code(s): `[NAVIGATION_CONFUSION / WRONG_ARTICLE / FUNCTION_SURFACE / DEAD_END / OTHER / NONE]`
- Product response problem: `[NONE / NO_RESPONSE / ERROR / UNREADABLE / OTHER]`
- A valid alternative path is not a wrong turn.

### Expected behavior and friction

- Sanitized paraphrase of what the participant expected: `[REQUIRED or NONE]`
- Observed hesitation/dead end: `[REQUIRED or NONE]`
- Fixed reason code(s): `[NAVIGATION_CONFUSION / CONTENT_TOO_THIN / OTHER / NONE]`
- Researcher interpretation, clearly separated: `[INTERPRETATION]`
- Counter-evidence to the interpretation: `[REQUIRED or NONE OBSERVED]`

Do not include identifying anecdotes, raw session transcript, or contact details. The minimum locked T2 verbatim text required below is the only transcript exception. A distinctive quotation requires separate report-quote permission and privacy review and still remains in restricted storage; it is not part of the public aggregate.

## 4. T2 observation — unaided product description

Capture the first answer before any follow-up or classification label.

| Field | Value |
| --- | --- |
| T2 outcome | `[SCORED_ON_TIME / FAIL_EARLY_PROMPT / FAIL_LATE_PROMPT / FAIL_TASK_REFUSED / FAIL_EARLY_DEPARTURE / FAIL_PARTICIPANT_BREAK / FAIL_PRODUCT_FAILURE / FAIL_EXPOSURE_DEVIATION / FAIL_CLASSIFICATION_CONTAMINATION / INVALIDATION_REVIEW / WITHDRAWN / HOLD_FOR_WITHDRAWAL_CLARIFICATION / HOLD_FOR_EXPOSURE_VALIDITY_REVIEW]` |
| Standardized article exposure source | `[PARTICIPANT_NAVIGATION / MODERATOR_SETUP_AFTER_T1 / NOT_EXPOSED / null while unresolved]` |
| Common exposure instruction delivered verbatim | `[true / false / null when not reached or unresolved]` |
| Exposure start condition | `[INSTRUCTION_COMPLETE_AND_ARTICLE_READABLE / NOT_STARTED / null while unresolved]` |
| Frozen article remained active/readable at T2 prompt | `[true / false / null when not reached or unresolved]` |
| Exposure deviation | `[NONE / NAVIGATED_AWAY / PRODUCT_INTERRUPTION / OTHER / NOT_APPLICABLE / null while unresolved]` |
| Exposure validity disposition | `[VALID_CONTINUOUS / FAIL_INSTRUCTION_CHANGED_OR_OMITTED / FAIL_PARTICIPANT_NAVIGATION / FAIL_PRODUCT_UNREADABLE / INVALID_EXTERNAL_APPARATUS / NOT_APPLICABLE / HOLD_UNVERIFIED / null while unresolved]` |
| T2 prompt timing band | `[EARLY_LT_285S / ON_TIME_285_TO_315S / LATE_GT_315S / NOT_EXPOSED / null while unresolved]` |
| T2 prompt timing within tolerance | `[true / false / null]` |
| Response-window disposition | `[RESPONSE_STARTED_WITHIN_120S / NO_RESPONSE_BY_120S / REFUSED / NOT_APPLICABLE / null while quarantined]` |
| Initial response captured before probes | `[true / false / null when not reached or quarantined]` |
| Restricted verbatim text of first response | `[exact locked wording / [unclear] / [redacted-identifier] / null]` |
| Verbatim capture mode | `[MANUAL_LIVE_TEXT / OPTIONAL_AUDIO_VERIFIED / NO_RESPONSE / NOT_APPLICABLE / null while quarantined]` |
| Verbatim verification state | `[PARTICIPANT_VERIFIED / PARTICIPANT_CORRECTED / UNVERIFIED / NO_RESPONSE / NOT_APPLICABLE / null while quarantined]` |
| T2 coding status | `[PENDING_INDEPENDENT_REVIEW / RESOLVED / UNRESOLVED_HOLD / NOT_APPLICABLE_NON_SCORED / null while quarantine or validity review]` |
| Primary code, reviewer A | `[code list / null for non-scored]` |
| Domain recognized, reviewer A | `[true / false / null for non-scored]` |
| Publication model recognized, reviewer A | `[true / false / null for non-scored]` |
| T2 recognition gate, reviewer A | `[true / false / null for non-scored]` |
| Primary code, reviewer B | `[code list / null for non-scored]` |
| Domain recognized, reviewer B | `[true / false / null for non-scored]` |
| Publication model recognized, reviewer B | `[true / false / null for non-scored]` |
| T2 recognition gate, reviewer B | `[true / false / null for non-scored]` |
| Coding disagreement | `[true / false / null for non-scored]` |
| Resolution and accountable reviewer | `[REQUIRED if disagreement]` |
| Final adjudicated primary code | `[code list / null while unresolved or non-scored]` |
| Final adjudicated domain recognized | `[true / false / null while unresolved or non-scored]` |
| Final adjudicated publication model recognized | `[true / false / null while unresolved or non-scored]` |
| Final adjudicated T2 recognition | `[true / false / null while unresolved, excluded, withdrawn, or quarantined]` |

### Follow-up diagnostics — excluded from T2 gate

- What supported the participant's classification: `[sanitized paraphrase]`
- What remained unclear: `[sanitized paraphrase]`
- Classification changed only after a probe: `[true / false]`

A prompted or post-probe recognition does not convert the unaided T2 gate to success. Every `FAIL_*` T2 outcome is retained with final recognition `false`, `NOT_APPLICABLE_NON_SCORED`, and null reviewer/classification/domain/model fields. Classification counts include only `SCORED_ON_TIME` rows; timing/outcome counts account for the remaining retained rows. `INVALIDATION_REVIEW`, `WITHDRAWN`, and `HOLD_FOR_WITHDRAWAL_CLARIFICATION` keep coding/response/reviewer/classification/final-recognition fields null until the preregistered disposition is applied. `HOLD_FOR_EXPOSURE_VALIDITY_REVIEW` may retain an already captured consent-covered response, but keeps coding/reviewer/classification/final-recognition fields null until validity resolves.

The T2 prompt timing band records when the participant-facing prompt began. It does not record or penalize the participant's thinking or answer duration. The response-window field is categorical; do not retain exact answer timing.

## 5. Deviations, failures, and invalidation review

| Field | Value |
| --- | --- |
| Protocol deviation | `[NONE or factual description]` |
| Moderator contamination | `[NONE / ISOLATED / SYSTEMIC]` |
| Assistance/prompt audit | `[counts match frozen cadence / deviation]` |
| Lab/device failure unrelated to tested product | `[NONE or factual description]` |
| Product failure visible to participant | `[NONE or factual description]` |
| Privacy/consent incident | `[NONE or incident reference]` |
| Proposed treatment | `[INCLUDE / EXCLUDE_AND_REPLACE / CANCEL_RUN / HOLD_FOR_REVIEW]` |
| Independent reviewer decision | `[REQUIRED when not INCLUDE]` |
| Decision evidence reference | `[REQUIRED when not INCLUDE]` |

Product failures, timeouts, give-up, abandonment, participant-requested breaks, exposure deviations, and unfavorable answers remain in the cohort as failures. Only a resolved withdrawal, verified external apparatus failure, or isolated pre-first-activation contamination can permit replacement. Systemic contamination cancels the cohort. Ambiguity is `HOLD_FOR_REVIEW`.

## 6. Counter-evidence and limitations

- Observation that contradicts an apparent positive finding: `[REQUIRED or NONE OBSERVED]`
- Observation that contradicts an apparent negative finding: `[REQUIRED or NONE OBSERVED]`
- Segment/device/accessibility context: `[REQUIRED]`
- Exposure or measurement limitation: `[REQUIRED or NONE]`
- Researcher interpretation boundary: `[REQUIRED]`

## 7. Privacy scrub and sign-off

- [ ] No name, email, signature, contact/compensation record, linkage key, wallet address, IP/device identifier, exact location, or authentication/payment data appears.
- [ ] No raw recording or transcript is embedded or linked with public access.
- [ ] The minimum locked T2 verbatim text is consent-covered, restricted, identity-scrubbed without semantic rewriting, and absent from every public artifact.
- [ ] No per-action timestamp or exact reading/viewing history was collected.
- [ ] Any quotation is optional-consent verified, de-identified, short, and remains in restricted storage.
- [ ] Observations and interpretations are labeled separately.
- [ ] The row was created from one retained, consented real participant; it is not rehearsal, automation, AI, or multi-agent output.
- [ ] Evidence storage and retention match the completed consent notice.
- [ ] This completed sheet and its analysis row will not be committed; only the post-cutoff aggregate allowlist may be public.

| Sign-off | Value |
| --- | --- |
| Observer completed | `[role/key + date]` |
| Coding reviewer completed | `[role/key + date]` |
| Privacy reviewer completed | `[role/key + date]` |
| Frozen evidence reference/digest | `[restricted path/ID + digest]` |
