# Stage A moderator script

**Status**: RUNBOOK / NOT EXECUTED<br>
**Scope**: issue #110 Stage A, T1 and T2 only<br>
**Default decision before execution**: `HOLD`

Use this script verbatim for the participant-facing lines. Text marked **Moderator only** must never be shown or read to the participant. Do not improvise labels that can reveal the T2 answer.

## 1. Preflight — before the participant joins

### Study freeze

- [ ] Study ID and protocol version: `[REQUIRED]`
- [ ] Prototype commit SHA: `[REQUIRED: 40 characters]`
- [ ] Prototype tree/build/deployment ID: `[REQUIRED]`
- [ ] Environment and URL: `[REQUIRED]`
- [ ] Variant: `A` for all six retained sessions
- [ ] Target article title and stable ID/slug: `[REQUIRED]`
- [ ] Target title/task wording contains no publication/Web3 classification label that would answer T2
- [ ] Entry URL/state: `[REQUIRED]`
- [ ] Locale/timezone: `[REQUIRED]`
- [ ] Device, viewport, browser/version, input mode, and network policy: `[REQUIRED]`
- [ ] T1/T2 task-card version: `[REQUIRED]`
- [ ] Consent version: `[REQUIRED]`
- [ ] T1 cap: the completion signal must occur before `180.000s` from the end of the T1 prompt; timeout wins an exact tie
- [ ] Standard exposure start: later of (a) the common exposure instruction ending and (b) the frozen target article title/body becoming readable
- [ ] T2 prompt time: begin the participant-facing prompt at `5:00` (allowed timing tolerance: +/-15 seconds) after standard exposure start
- [ ] T2 initial-response window: the first response must begin within `2:00` after the T2 prompt ends; let an in-window response finish

If any frozen value differs from an earlier retained session, stop and set the run to `HOLD`. Do not silently pool variants, builds, target articles, or task wording.

### Privacy and data readiness

- [ ] A random `participant_key` and `session_key` exist; neither is derived from identity or contact data.
- [ ] Eligibility and participation consent are verified in the private system.
- [ ] Every optional permission has a versioned state; audio/screen recording remain off unless `GRANTED`, and manual observation is always available.
- [ ] A clean demo browser/profile is ready; notifications, autofill, personal accounts, extensions, and saved credentials are absent.
- [ ] No real login, payment, wallet, identity provider, production secret, or private account is required.
- [ ] The observation sheet contains no name, email, signature, wallet address, exact location, IP/device identifier, or linkage key.
- [ ] The completed observation sheet and analysis CSV are configured for restricted storage only and cannot be committed by the session workflow.
- [ ] Timing notes are limited to T1 seconds rounded to the nearest 5, T2 prompt timing band, and categorical response-window disposition; per-action timestamps and exact reading/answer timing are disabled.
- [ ] Restricted verbatim-text capture for the first T2 answer is ready under participation consent; optional recording is not required for scoring.
- [ ] Moderator and observer clocks are synchronized.

### Prototype sanity check

Using a non-participant fixture only, verify that the frozen entry page, target article, readable body, and safe return path load. Delete the rehearsal data and label any retained rehearsal note `SIMULATED_EXPERIENCE`; it must never enter a participant denominator.

Do not rehearse after the participant's browser/session is initialized. If the product itself fails during a participant session, use the failure rules; do not erase the failure by calling it a rehearsal problem.

## 2. Opening — participant-facing

> 謝謝你參加。今天你會使用一個數位內容原型。我們測試的是產品與研究流程，不是在測驗你，也沒有標準答案。
>
> 請依你平常使用內容網站的方式操作，並盡量說出你正在找什麼、原本預期會發生什麼。你可以略過問題、要求暫停，或隨時停止，不需要說明理由。
>
> 我不會在任務進行中告訴你要按哪裡。如果你卡住，我可能只會請你說明下一步想做什麼。

Do not say Taiwan basketball, magazine, archive, news, membership, crypto, Web3, wallet, provenance, Stamp, Passport, or any expected classification before the unaided T2 response is locked.

## 3. Consent confirmation — participant-facing

> 在開始前，我確認你已閱讀版本 `[CONSENT_VERSION]` 的參與說明，已同意參與，而且知道可以隨時停止。對參與內容或資料使用還有問題嗎？

**Moderator only**:

- If participation consent is absent before exposure, do not proceed, do not create an observation row, record only the aggregate `NO_CONSENT_BEFORE_EXPOSURE` disposition, and allow a replacement.
- If observation already occurred before invalid consent is discovered, stop, quarantine/delete every affected artifact, open an incident, and `CANCEL` the affected run; do not silently substitute a replacement.
- If a person with valid consent withdraws, stop, cascade deletion, remove the row, reopen any pre-cutoff receipt, and require a replacement under the disclosed rule.
- Ask each optional recording/quote choice separately. Do not treat live viewing as stored-recording permission.
- If recording is `DECLINED` or `REVOKED`, continue with manual notes. Revocation stops that medium immediately and triggers deletion of its artifacts/derivatives without deleting still-consented manual observations.
- Recording without `GRANTED` permission requires immediate stop/deletion, an incident, and `CANCEL` of the affected run.
- Record versioned permission states on the restricted working sheet; keep scope and granted/revoked times in the private consent system and place only its restricted reference on the sheet. No completed row or permission choice is repository-safe. The consent artifact remains private.

## 4. Baseline question — participant-facing

> 開始前，請告訴我你現在看到的畫面是否清楚，文字大小與操作方式是否需要調整？

Accessibility adjustments that do not reveal navigation or the expected classification are allowed. Record the adjustment. If an agreed adjustment cannot be provided, stop with `HOLD`; do not score a participant failure.

## 5. T1 — find and start the specified article

Show only the T1 participant card. Read it once:

> 請從目前這個畫面找到「`[FROZEN_TARGET_ARTICLE_TITLE]`」這篇內容，並開始閱讀。請依你平常的方式操作；過程中盡量說出你正在找什麼，以及你以為下一步會發生什麼。當你認為已開始閱讀時，請說「完成」。

Start the T1 timer after the prompt ends.

### Allowed moderator prompts

Use only this frozen cadence, without pointing or changing tone toward a control:

1. Give no prompt during the first 20 seconds.
2. After at least 20 continuous seconds with no activation and no spoken plan, say once: > 你下一步想做什麼？
3. If another at least 20 continuous seconds passes with no activation and no spoken plan, say once: > 請繼續依你平常的方式操作。
4. Read the full task card again verbatim only after an explicit participant request, at most once.

Record counts for neutral prompt 1, neutral prompt 2, and task-card reread. Any additional prompt, different wording, or untriggered prompt is a protocol deviation and is not silently treated as neutral.

### Prohibited assistance

- Naming, describing, pointing to, highlighting, or operating a control.
- Rephrasing the target in a way that reveals its location or product hierarchy.
- Confirming that a path, label, or classification is correct.
- Explaining Issue, TOC, magazine, archive, article structure, or the expected product model.
- Resetting the participant because their behavior is unfavorable.

The objective exposure boundary for contamination is the participant's first activation after the completed T1 prompt. One isolated prohibited cue before that boundary quarantines the session for `EXCLUDE_AND_REPLACE`; after that boundary it remains in the denominator as `ASSISTED_FAIL` for T1 when navigation was assisted. A classification cue after that boundary and before T2 is locked is `FAIL_CLASSIFICATION_CONTAMINATION`, with final T2 recognition `false`. The same forbidden cue/process affecting two or more sessions is systemic and `CANCEL`s the affected cohort. Unclear attribution is `HOLD`; decide before aggregate unblinding.

### T1 endpoint

Stop T1 when either:

1. Before `180.000s`, the frozen target article title/body are readable and the participant gives the frozen "完成" signal (or the preregistered accessible equivalent); or
2. `180.000s` occurs first, the participant gives up, or a stop condition occurs. Timeout wins an exact tie. Retain only the five-second-rounded duration and outcome, not sub-second timing.

Do not announce success or failure.

Use `FAIL_GIVE_UP` for an explicit T1 refusal/give-up. Use `FAIL_ABANDONED` when a participant-requested break, confirmed stop-retain, or departure prevents T1 completion. Withdrawal and closed invalidation rules still take precedence.

If T1 conditions overlap, use the single primary-outcome precedence in the denominator rules and record the other conditions as deviations.

- After T1 failure, if the frozen title/body are not readable, say: "這個任務先到這裡。為了讓下一段看到相同內容，我會載入指定文章；這不會改變剛才的任務紀錄。" Hide the participant view, load the preregistered direct article URL without demonstrating the correct path, restore the view when readable, and record `MODERATOR_SETUP_AFTER_T1`. If already readable, do not reload and record `PARTICIPANT_NAVIGATION`.
- After either transition, read the same exposure instruction once: > 接下來請依平常方式閱讀這篇內容，並留在這篇內容中；我稍後會請你做下一件事。
- Deliver the instruction verbatim. If it is materially changed, do not repair/restart to rescue the row; record `FAIL_EXPOSURE_DEVIATION` and use the actual instruction end only to schedule a diagnostic prompt. If it is omitted entirely, record `FAIL_EXPOSURE_DEVIATION`, set prompt timing to `NOT_EXPOSED`, and do not administer a gated T2 prompt; diagnostic follow-up may occur after the failed task disposition.
- Start the five-minute exposure stopwatch at the later of the verbatim instruction ending and the frozen title/body becoming readable. `Active/readable` means the same frozen article route remains active and its body remains renderable; normal scrolling may move the title offscreen. Permit scrolling and controls within that article, but not navigation away.
- If the participant leaves the article at any time, record `FAIL_EXPOSURE_DEVIATION`. If the tested product makes the article body unrenderable/unreadable at any time during the interval—even if it later recovers—or it is not active/readable at the T2 prompt, record `FAIL_PRODUCT_FAILURE`. Retain either with final T2 recognition `false` and never reset/restart to rescue the row.
- A cosmetic/layout issue, delayed optional in-article control, or slowness remains eligible for scoring only when the frozen article route/body stays continuously active/readable and the instruction, prompt timing, response capture, and observation remain intact; record it as a deviation.
- After an exposure deviation, keep the original stopwatch running and administer the scheduled T2 prompt only for diagnosis when safe; do not navigate the participant back or convert the outcome to scored.
- If the target article cannot be made readable, stop and apply the product/lab-failure rule. Do not substitute a different article.

## 6. T2 — unaided product description

Begin the T2 participant-facing prompt at `5:00` (+/-15 seconds) after standard exposure start, pause new interaction, and show only the T2 participant card. For a scoring-eligible exposure, the frozen article must still be active/readable; after an already-recorded terminal exposure failure, the same prompt may be used diagnostically even when it is not, but can never be converted to scored:

> 先不用再操作。請用你自己的話說明：你覺得剛才使用的產品是什麼？

When the prompt ends, start a two-minute response-window stopwatch. If a first response begins before `120.000s`, let it finish and lock it before any follow-up. If none begins before `120.000s`, lock `UNCLEAR_OR_NO_RESPONSE` and final recognition `false`; do not extend the window. Timing validity is determined by when the T2 prompt began, not by answer latency. Retain only `RESPONSE_STARTED_WITHIN_120S` or `NO_RESPONSE_BY_120S`, not exact answer timing.

Map the categorical response-window field deterministically: administered prompt + response begins in-window → `RESPONSE_STARTED_WITHIN_120S`; administered prompt + no response by the boundary → `NO_RESPONSE_BY_120S`; explicit T2 refusal before the window runs → `REFUSED`; window never reached because a terminal condition occurred → `NOT_APPLICABLE`; unresolved withdrawal/exposure quarantine → `null`.

Capture the locked first answer as restricted verbatim text, without cleanup or semantic paraphrase. Mark uncertain audio as `[unclear]`; redact an accidental identifier with `[redacted-identifier]` without replacing its meaning. Before classification probes, read/display only the captured wording and ask: > 為確認逐字紀錄，這段文字是否正確記下你剛才說的話？

Record `PARTICIPANT_VERIFIED`, `PARTICIPANT_CORRECTED`, `UNVERIFIED`, or `NO_RESPONSE`. Corrections repair transcription only and do not invite a new classification answer. If a pass-critical phrase remains disputed or unclear, final recognition is `false`; do not exclude the row. Two human reviewers later code the locked text independently without seeing each other's code.

Allowed neutral probes after the initial response is captured:

- > 什麼讓你這樣判斷？
- > 如果要介紹給朋友，你會怎麼說？
- > 有沒有哪個部分讓你不確定？

Do not present choices, repeat the metric labels, or ask whether it is a magazine/archive/news/membership/crypto product. Coding occurs after the session using the frozen rubric.

### T2 timing and non-completion disposition

Use a monotonic stopwatch but retain only the T2 prompt timing band, not exact exposure or answer time:

- `ON_TIME_285_TO_315S`: the participant-facing prompt began within the band; record `SCORED_ON_TIME` and score normally unless a higher-precedence terminal condition applies.
- `EARLY_LT_285S`: if the prompt began early, record `FAIL_EARLY_PROMPT`; retain the session and set final T2 recognition to `false` regardless of the response.
- `LATE_GT_315S`: if the prompt began late, administer only for diagnosis, record `FAIL_LATE_PROMPT`; retain the session and set final T2 recognition to `false` regardless of the response.
- Participant declines T2 but stays for closeout: record `FAIL_TASK_REFUSED`. A confirmed `STOPPED_RETAIN_DATA` that ends the session is `FAIL_EARLY_DEPARTURE`. Retain either and set final T2 recognition to `false`; exposure/response fields may be `null`.
- A participant-requested break that prevents the standardized exposure/response from completing is `FAIL_PARTICIPANT_BREAK`; retain it with final recognition `false` unless the person chooses withdrawal.
- Any tested-product interruption that makes the frozen article body unrenderable/unreadable during the required interval, or prevents T2 completion, is `FAIL_PRODUCT_FAILURE`; recovery before the prompt does not restore scoring eligibility. Only bounded issues that preserve continuous article readability and every measurement condition remain scored deviations.
- Leaving the frozen article during exposure is `FAIL_EXPOSURE_DEVIATION`; retain it with final recognition `false`.
- An isolated classification cue after the first-activation boundary and before T2 lock is `FAIL_CLASSIFICATION_CONTAMINATION`; retain it with final recognition `false` and do not code the response.
- Valid consent withdrawal: stop and use the withdrawal rule; do not score the task.
- An objective external lab/safety apparatus failure is only a scored deviation when independent evidence verifies that the participant's article view and every timing/capture condition remained intact. If it destroys or makes required exposure/measurement unverifiable, use `INVALIDATION_REVIEW`, then `EXCLUDE_AND_REPLACE` after independent verification before aggregate unblinding. Apply the tested-product readability rule above to product slowness.
- If available evidence cannot yet distinguish a valid exposure, tested-product failure, or external apparatus invalidation, use `HOLD_FOR_EXPOSURE_VALIDITY_REVIEW`; do not code recognition until independent review resolves it.

Do not pause the exposure timer for normal loading, interaction, silence, or moderator delay. Never choose inclusion after reading the response.

If conditions overlap, use the single primary-outcome precedence in the denominator rules and record every secondary condition as a deviation.

## 7. Diagnostic follow-up — after T2 is locked

These questions are optional diagnostics and do not change T1/T2 scoring:

- > 剛才哪一步最符合你的預期？
- > 哪一步最不像你預期的內容網站？
- > 如果只能改一件事，你會先改什麼？

Do not ask T3–T6 tasks or introduce wallet, provider, provenance, Stamp, Passport, payment, or retention flows.

## 8. Debrief and close — participant-facing

> 今天的兩個任務已結束。這是六人的流程 pretest，結果只用來診斷原型與研究方法，不能代表所有讀者或市場。
>
> 再提醒一次，你可以依參與說明中的方式，在 `[WITHDRAWAL_CUTOFF]` 前聯絡 `[DELETION_CONTACT]`，要求處理仍可連結到你的研究資料。你對今天的活動或資料使用還有問題嗎？

After the participant leaves, stop all approved recordings and close the demo session before opening any private research system.

## 9. Immediate post-session procedure

1. Record outcome codes and observed facts before interpretation.
2. Separate participant behavior, locked T2 verbatim text, diagnostic paraphrase, researcher inference, and counter-evidence.
3. Mark every allowed prompt/reread count and any prohibited assistance, exposure deviation, product failure, lab failure, stop/withdrawal disposition, or privacy incident.
4. Ask a second accountable reviewer to decide any exclusion before aggregate results are viewed.
5. Move optional recordings/transcripts and required T2 verbatim text to their declared private/restricted systems; do not copy them into the repository. Record only T1 duration rounded to five seconds, the T2 prompt timing band, and categorical response-window disposition.
6. Run the observation-sheet privacy scrub.
7. Freeze the restricted sheet version and append its private evidence reference; never overwrite history silently. Keep pre-cutoff receipts private and publish only the post-cutoff aggregate allowlist.

## 10. Stop conditions

Stop the task or session immediately when:

- The participant asks to stop. Stop first, then read only: > 我會停止。為了正確處理資料，請問你希望「停止今天的活動但保留停止前已收集的資料」，還是「撤回參與同意並依說明刪除仍可連結的資料」？你也可以回答不確定。
- Participation consent cannot be verified. If this is discovered before exposure, do not create a row; if discovered after observation, cancel the affected run and invoke the incident/deletion procedure.
- Personal, authentication, payment, wallet, or other unapproved data appears.
- The prototype commit/environment cannot be matched to the freeze record.
- A required accommodation cannot be provided safely.
- The participant experiences material discomfort or the session cannot continue safely.
- The moderator has contaminated the task or T2 answer.

Record `STOPPED_RETAIN_DATA` only after an unambiguous first choice and apply the retained terminal-failure rule. Record `WITHDRAWN_DELETE_DATA` only after an unambiguous second choice and cascade-delete/replace. If the answer is uncertain or unavailable, quarantine as `HOLD_FOR_WITHDRAWAL_CLARIFICATION`; do not assume retention, deletion, or failure.

A consent/privacy breach, recording without permission, fabricated or duplicate participant, material mid-run build change, systemic moderator contamination, or unauditable evidence cancels the affected run. A valid unfavorable product outcome is not an invalidation and must not be replaced.
