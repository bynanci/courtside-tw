# Stage A denominator and decision rules

**Status**: PREREGISTRATION / NO RESULTS<br>
**Decision scope**: six-person T1/T2 pretest only<br>
**Inference limit**: diagnostic evidence; no population, market, retention, revenue, or product-market-fit claim

Freeze this document before the first participant. For issue #110 Stage A, this file is the versioned operational rule adopted by `001-web3-magazine-user-research-method.md`. A rule change after exposure requires a new version, preserved old rule/result, accountable approval, and a new cohort where the change affects interpretation.

Issue #110 `Stage A` and the parent method's six-person `P0` are the same bounded pretest layer.

## 1. Cohort and count vocabulary

| Count | Definition |
| --- | --- |
| `n_screened` | Unique real people who completed the private screener. |
| `n_eligible` | Screened people who met eligibility before product exposure. |
| `n_consented` | Eligible people with participation consent captured before observation. |
| `n_started` | Consented people who received the T1 prompt and began product exposure. |
| `n_withdrawn` | People who withdrew before the receipt freeze; their task data is removed. |
| `n_invalidated` | Sessions excluded by an independent, evidence-backed apparatus/protocol invalidation decision. |
| `n_retained` | Valid consented human sessions retained for both Stage A gates. Required value: exactly `6`. |
| `n_completed_t1` | Retained sessions with a scored T1 outcome, including failures. Must equal `6`. |
| `n_completed_t2` | Retained sessions with a terminal T2 outcome, including every preregistered failure/no-response code. Must equal `6`. |

The gate cohort is the first six valid retained sessions from unique, eligible, consented real people, including preregistered terminal failure/no-response outcomes, using one frozen build, environment, target article, variant, task cards, and moderator protocol. Preserve scheduled and replacement order before calculating aggregates.

The denominator never shrinks below six to make a rate pass. Until `n_retained=6` and both task denominators equal six, the receipt is `HOLD / INCOMPLETE`.

## 2. Inclusion, missing value, and replacement rules

| Event | Treatment |
| --- | --- |
| Ineligible or `NO_CONSENT_BEFORE_EXPOSURE` | Collect no task data; exclude; replacement allowed; never enters a task denominator. |
| `OBSERVED_WITHOUT_VALID_CONSENT` discovered after exposure | Stop; quarantine/delete all affected artifacts; open an incident; `CANCEL` the affected run; no metric or silent replacement. |
| `WITHDRAWN_DELETE_DATA` before receipt freeze | Stop, cascade-delete/remove the session data under the consent rule, exclude, and require a replacement. |
| `STOPPED_RETAIN_DATA` | Stop; retain still-consented data and give every affected task its preregistered terminal failure code. |
| Stop/withdrawal intent unclear or unavailable | Quarantine as `HOLD_FOR_WITHDRAWAL_CLARIFICATION`; infer neither retention, deletion, nor failure. |
| Permitted withdrawal after a receipt but before the disclosed cutoff | Reopen/version the receipt, remove the data, return to `HOLD`, and require a replacement. |
| Timeout, give-up, task refusal, abandonment, or early departure without withdrawing consent | Retain; every affected gated task is a failure. |
| No T2 response begins within 120 seconds after an on-time prompt ends | Retain as `SCORED_ON_TIME`, code `UNCLEAR_OR_NO_RESPONSE`, and set T2 recognition false. |
| T2 prompt before 285 seconds or after 315 seconds without an approved external invalidation | Retain as `FAIL_EARLY_PROMPT` or `FAIL_LATE_PROMPT`; T2 recognition is false regardless of response. |
| T2 not exposed/completed because of task refusal or early departure without consent withdrawal | Retain as `FAIL_TASK_REFUSED` or `FAIL_EARLY_DEPARTURE`; T2 recognition is false and exposure/response fields may be null. |
| Participant-requested break prevents standardized exposure/response | Retain as `FAIL_PARTICIPANT_BREAK`; T2 recognition is false unless the person chooses withdrawal. |
| Product crash, broken path, forced navigation, slow product response, or ordinary supported-network failure prevents T2 | Retain as `FAIL_PRODUCT_FAILURE`; do not replace. |
| Participant leaves the frozen article during standardized exposure | Retain as `FAIL_EXPOSURE_DEVIATION`; do not reset/replace; T2 recognition is false. |
| Verified external lab/device/safety apparatus failure, unrelated to the tested product, destroys required measurement | Exclude the whole session and replace only after independent review before aggregate unblinding. |
| One isolated prohibited cue before the participant's first activation after the completed T1 prompt | Exclude the whole session and replace after independent verification. |
| One isolated prohibited cue after that first-activation boundary | Retain. Navigation assistance makes T1 `ASSISTED_FAIL`; a classification cue before T2 lock makes T2 `FAIL_CLASSIFICATION_CONTAMINATION`, coding not applicable, and recognition false. |
| The same forbidden cue/process affects two or more sessions | `CANCEL` the affected cohort as systemic contamination. |
| Recording loss with sufficient approved notes/logs to score the frozen fields | Retain; note the limitation. |
| Recording occurs without `GRANTED` permission | Stop/delete the medium and derivatives, open an incident, and `CANCEL` the affected run. |
| Ambiguous validity or missing audit evidence | `HOLD`; do not exclude merely because exclusion would improve the result. |

Decide objective invalidation before viewing aggregate pass/fail totals. Replacements preserve the preregistered segment quota. Never replace a participant for being slow, failing, abandoning, disliking the product, or giving an unfavorable classification.

## 3. T1 scoring

### Independent success

Set `t1_success=1` only when the frozen completion signal occurs before `180.000s` from the completed T1 prompt and without prohibited assistance:

1. The participant reaches the exact frozen target article;
2. The article body is visible; and
3. The participant gives the frozen "完成" signal or preregistered accessible equivalent.

At exactly `180.000s`, timeout wins and `t1_success=0`. Retain only the five-second-rounded duration plus authoritative outcome; do not store sub-second timing. A product failure is a failure; an approved accessibility accommodation that does not reveal the path is not assistance.

For T1, an explicit task refusal/give-up is `FAIL_GIVE_UP`; a participant-requested break, confirmed stop-retain, or departure that prevents completion is `FAIL_ABANDONED`. Both remain false in the T1 denominator unless the person withdraws or the session meets a closed invalidation rule.

If T1 conditions overlap, use one primary outcome in this order and record the rest as deviations: `WITHDRAWN` → `HOLD_FOR_WITHDRAWAL_CLARIFICATION` → `INVALIDATION_REVIEW` → `PRODUCT_FAILURE` → `ASSISTED_FAIL` → `FAIL_ABANDONED` → `FAIL_GIVE_UP` → `FAIL_TIMEOUT` → `SUCCESS`. A pre-first-activation cue enters `INVALIDATION_REVIEW`; exact `180.000s` enters `FAIL_TIMEOUT` unless a higher-precedence condition already occurred.

```text
T1 success rate = sum(t1_success) / 6
Target = at least 90%
Integer cutoff at n=6 = 6/6
```

`5/6 = 83.3%` does not meet a 90% target.

### Activations

Use the activation definition on the T1 task card. After and only after T1 reaches `6/6`, sort all six counts in ascending order:

```text
activation median = (x3 + x4) / 2
Target = median <= 3
Equivalent check = x3 + x4 <= 6
```

Report all six counts, median, minimum, maximum, and wrong-turn counts. Do not report an activations gate from successful participants only when T1 has failures; that would hide survivorship.

## 4. T2 scoring

After either T1 transition, give the same frozen neutral instruction to read and remain in the target article. The standardized exposure stopwatch begins at the later of instruction completion and frozen title/body readability. After a T1 failure where the target is not readable, the moderator may load the preregistered direct URL with participant view hidden; this never changes the T1 failure. Code only the locked first unaided response following a T2 prompt that began in the `ON_TIME_285_TO_315S` band and no other terminal `FAIL_*` condition. Record only exposure source, prompt timing band, categorical response-window disposition, and exposure-deviation fields—not exact reading or answer time. Follow-up answers remain diagnostic.

### Exposure-validity matrix

`Article continuously active/readable` means the same frozen article route remains active and its body is renderable for the entire required interval; normal scrolling may move the title offscreen.

| Observed condition | Fixed treatment |
| --- | --- |
| Verbatim common instruction; continuous article; intact timing/capture | Eligible for `SCORED_ON_TIME` if every other rule passes. |
| Common instruction omitted or materially changed | Retain as `FAIL_EXPOSURE_DEVIATION`; no coding. |
| Participant navigates away from the frozen article at any time | Retain as `FAIL_EXPOSURE_DEVIATION`; do not reset or replace. |
| Tested product makes the article body unrenderable/unreadable at any time, even if it recovers, or the article is not active/readable at the prompt | Retain as `FAIL_PRODUCT_FAILURE`; recovery does not restore eligibility. |
| Cosmetic/layout defect, delayed optional in-article control, or slowness while the article body remains continuously readable and timing/capture remain intact | Continue as a scored deviation; record the issue. |
| External apparatus interruption with independent proof that participant view and all measurement remained intact | Continue as a scored deviation. |
| External apparatus interruption destroys or makes required exposure/measurement unverifiable | `INVALIDATION_REVIEW`, then exclude/replace after independent approval before aggregate unblinding. |
| Exposure validity cannot be resolved from frozen evidence | `HOLD_FOR_EXPOSURE_VALIDITY_REVIEW`; do not choose the favorable path or code recognition. |

`Unaided` requires that the study-specific invitation, direct screener, consent, moderator, and task card did not expose Taiwan basketball or any publication/Web3 classification label. Segment assignment must come from the blinded study-independent source. Apply the fixed contamination boundary above to a direct cue: isolated before first activation means exclude/replace; isolated after that boundary means retained T2 failure; systemic contamination cancels the cohort. Do not guess the counterfactual answer.

Timing disposition is deterministic:

- `SCORED_ON_TIME`: the participant-facing T2 prompt began at 285–315 seconds. Start a 120-second response window when the prompt ends; code a response that begins before `120.000s`, or `UNCLEAR_OR_NO_RESPONSE` if none begins. Participant thinking/answer time does not change prompt timing validity.
- `FAIL_EARLY_PROMPT` / `FAIL_LATE_PROMPT`: retain, set `t2_recognition=0`, and use the response only as a diagnostic note.
- `FAIL_TASK_REFUSED` / `FAIL_EARLY_DEPARTURE`: retain, set `t2_recognition=0`; exposure and response may be null.
- `FAIL_PARTICIPANT_BREAK` / `FAIL_PRODUCT_FAILURE` / `FAIL_EXPOSURE_DEVIATION`: retain and set `t2_recognition=0`.
- `FAIL_CLASSIFICATION_CONTAMINATION`: retain after an isolated post-boundary cue, set `t2_recognition=0`, and do not code the response.
- `INVALIDATION_REVIEW`: allowed only for a verified objective external lab/device/safety apparatus failure that destroys measurement; exclude/replace after independent review before aggregate unblinding.
- `WITHDRAWN`: delete/remove under the consent rule and require a replacement.
- `HOLD_FOR_WITHDRAWAL_CLARIFICATION`: quarantine with no score until intent resolves.
- `HOLD_FOR_EXPOSURE_VALIDITY_REVIEW`: quarantine with no score until independent evidence resolves exposure validity.

When more than one condition occurs, assign exactly one primary T2 outcome using this precedence and record the rest as deviations: `WITHDRAWN` → `HOLD_FOR_WITHDRAWAL_CLARIFICATION` → `HOLD_FOR_EXPOSURE_VALIDITY_REVIEW` → `INVALIDATION_REVIEW` → `FAIL_CLASSIFICATION_CONTAMINATION` → `FAIL_PRODUCT_FAILURE` → `FAIL_PARTICIPANT_BREAK` → `FAIL_EARLY_DEPARTURE` → `FAIL_TASK_REFUSED` → `FAIL_EXPOSURE_DEVIATION` → `FAIL_EARLY_PROMPT`/`FAIL_LATE_PROMPT` → `SCORED_ON_TIME`. Use `FAIL_TASK_REFUSED` when the participant declines T2 but stays for closeout; use `FAIL_EARLY_DEPARTURE` when they end/leave the session while retaining data.

The monotonic exposure/response timers do not pause for normal loading, interaction, participant silence, or moderator delay. Store no exact T2 exposure or answer time.

Response-window mapping is fixed: an administered prompt yields `RESPONSE_STARTED_WITHIN_120S` or `NO_RESPONSE_BY_120S`; explicit refusal before the window runs yields `REFUSED`; a window never reached because another terminal condition occurred yields `NOT_APPLICABLE`; unresolved quarantine yields null.

For `SCORED_ON_TIME`, two human reviewers independently code the locked restricted verbatim text without seeing each other's code. A researcher's sanitized paraphrase is not scoring evidence. If a pass-critical phrase remains disputed/unclear after the neutral transcription check, score recognition false. For every non-scored `FAIL_*`, set `t2_coding_status=NOT_APPLICABLE_NON_SCORED`, leave reviewer/classification/domain/model fields null, and set final recognition false. Classification counts include only `SCORED_ON_TIME` rows.

Set `t2_recognition=1` only when the response identifies both:

1. Taiwan basketball as the content domain; and
2. An editorial digital magazine, archive, curated issue/collection, or historical-record model.

Use the frozen codebook in the task card. `basketball website/app` alone is too generic. Resolve reviewer disagreement before aggregate unblinding; an unresolved score is `HOLD`.

A mixed answer that leaves a qualifying and non-qualifying product model at equal status is not unambiguous recognition and scores false unless the locked wording explicitly identifies the qualifying model as primary.

```text
T2 recognition rate = sum(t2_recognition) / 6
Target = at least 80%
Integer cutoff at n=6 = at least 5/6
```

`5/6 = 83.3%` passes the point-estimate gate; `4/6 = 66.7%` does not.

## 5. Segments and variants

- Every participant has exactly one primary segment fixed before exposure from the study-independent blinded source.
- Keep row-level segment/device/accessibility context restricted. Public output has no participant rows or subgroup cross-tabs; any public categorical cell below 3 is suppressed or combined as `OTHER/UNREPORTED`.
- All six retained sessions use baseline Variant `A`. Splitting six across variants cannot satisfy Stage A.
- A change to build, target article, content fixture, entry state, task wording, or meaningful UX creates a new cohort; do not pool it with the original six.
- Device/browser/accessibility context is diagnostic and must not be used post hoc to discard unfavorable results.

## 6. Uncertainty and reporting

In the private analysis and post-cutoff aggregate receipt, report each binary metric's numerator, denominator, percentage, and two-sided 95% Clopper-Pearson exact interval. The point-estimate integer cutoff controls this pretest gate; the interval communicates how uncertain six observations remain.

| Count | Point estimate | 95% exact interval (rounded) | Gate note |
| --- | ---: | ---: | --- |
| `0/6` | 0% | 0%–45.9% | Miss |
| `1/6` | 16.7% | 0.4%–64.1% | Miss |
| `2/6` | 33.3% | 4.3%–77.7% | Miss |
| `3/6` | 50% | 11.8%–88.2% | Miss |
| `4/6` | 66.7% | 22.3%–95.7% | Miss |
| `5/6` | 83.3% | 35.9%–99.6% | T2 point-estimate pass; T1 miss |
| `6/6` | 100% | 54.1%–100% | T1 and T2 point-estimate pass; still highly uncertain |

If the decision owner intends the confidence-interval lower bound itself to exceed 90% or 80%, six participants can never satisfy that rule. Change the sample-size/protocol prospectively; do not reinterpret the current gate after results.

Always include this limitation:

> P0 diagnostic evidence from six participants only; no market demand, adoption, population usability, retention, revenue, or product-market-fit inference.

## 7. GO / HOLD / CANCEL rule

Apply one precedence order: (1) `CANCEL` if any cancellation predicate is true; otherwise (2) `HOLD` if any GO condition is false or unknown; otherwise (3) `GO`. A human reviewer may block sign-off, which makes the sign-off condition false and therefore `HOLD`, but cannot promote `HOLD` or `CANCEL` to `GO`.

### `GO` — bounded Stage A pretest gate only

Every condition must be true:

- `n_retained = n_completed_t1 = n_completed_t2 = 6` real, consented people.
- One frozen commit/environment/variant/task set was used.
- T1 independent success is `6/6`.
- T1 activation median is at most `3`.
- T2 unaided recognition is at least `5/6`.
- No unresolved consent, privacy, coding, assistance, build-drift, exclusion, or evidence-integrity issue exists.
- Counter-evidence, deviations, exclusions, segment context, and uncertainty are recorded.
- The accountable human owner, independent method reviewer, and privacy/consent reviewer complete the required sign-off without an unresolved objection.

`GO` means only that this Stage A T1/T2 pretest met its provisional diagnostic gate. It does not close issue #110, authorize recruitment or Stage B/T3–T6, validate Web3 or commercial value, change production, or replace another required approval.

### `HOLD` — default and remediable state

Use `HOLD` when any applies:

- The study has not run or fewer than six valid retained sessions exist.
- T1 is at most `5/6`.
- T1 activation median exceeds `3`.
- T2 is at most `4/6`.
- A scorer disagreement, exclusion, freeze mismatch, required field/artifact, privacy question, or protocol deviation remains unresolved.
- Required human sign-off is missing or contains an unresolved objection.
- A bounded product/script correction and new frozen pretest are needed.

A valid metric miss is diagnostic `HOLD`, not evidence to delete or replace a participant.

### `CANCEL` — affected run integrity is unusable

Cancel the affected run when its ethical or methodological integrity cannot be recovered, including:

- observation performed without valid participation consent;
- recording performed without `GRANTED` permission;
- a material privacy/safety breach;
- fabricated, automated, duplicate, or non-real participants;
- material task/build changes pooled mid-run;
- systemic moderator contamination; or
- unauditable or altered source evidence.

Do not calculate or claim a gate result from a cancelled run. `CANCEL` here cancels the affected run/frozen prototype evidence, not the entire product or market direction; a broader cancellation requires a separate accountable human decision and appropriate evidence.

## 8. Required analysis outputs

- Private participant-flow counts from screened through retained; public exclusion/replacement cells below 3 are suppressed or combined.
- Six-row restricted analysis table using `stage-a-analysis.template.csv`.
- T1 success count/rate/exact interval and all activation counts/median/range.
- T2 recognition count/rate/exact interval and classification counts.
- Restricted segment/variant/device context; no public row or small-cell cross-tab.
- Every missing value, exclusion, replacement, deviation, assistance event, and invalidation decision.
- Counter-evidence and limitations.
- Versioned human-owned decision receipt kept private through the withdrawal cutoff, followed by a privacy-reviewed aggregate-only public receipt if authorized.
