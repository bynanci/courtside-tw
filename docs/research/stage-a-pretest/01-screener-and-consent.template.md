# Stage A screener and consent placeholders

**Status**: DRAFT TEMPLATE / NOT EXECUTED<br>
**Study scope**: issue #110 Stage A, T1/T2, six retained real participants<br>
**Use condition**: an accountable owner must fill and review every `[REQUIRED…]` placeholder before recruitment

This operational template does not state or imply IRB/REC, legal, privacy-office, or institutional approval. The responsible owner must determine which reviews and notices apply before use.

Do not send or display this complete file to a candidate. Internal quota labels and operational rules would reveal the T2 categories. The participant sees only the separately rendered participant-facing invitation, pre-screener privacy notice, neutral eligibility questions, and completed consent text; the recruiter must not disclose the hidden segment source or category names.

## A. Private screener

The completed screener, contact details, scheduling data, compensation data, and participant-key linkage belong in approved private systems. Completed screeners and row-level records must never be committed to this repository.

### Study control fields

- Study ID: `[REQUIRED: stable study ID]`
- Screener version: `[REQUIRED: version]`
- Effective date: `[REQUIRED: YYYY-MM-DD]`
- Research owner role: `[REQUIRED: accountable role]`
- Private screener system: `[REQUIRED: approved system]`
- Authorized access roles: `[REQUIRED: least-privilege roles]`
- Retention end / deletion rule: `[REQUIRED: date or rule]`

### Participant-facing pre-screener privacy notice

Show this notice and capture acknowledgment before collecting any eligibility answer, including from people who are later screened out. It is not a substitute for the separate participation consent.

- Screening-data owner/contact: `[REQUIRED]`
- Purpose: determine eligibility and fill preregistered research quotas.
- Fields collected: `[REQUIRED: minimum eligibility fields and study-independent segment attributes]`
- Prior-data matching disclosure: `[REQUIRED: whether broad content/technology responses previously supplied to the declared panel/omnibus will be reused for eligibility/quota matching]`
- Private storage and access roles: `[REQUIRED]`
- Retention/deletion date or rule, including screen-outs: `[REQUIRED]`
- Deletion/request contact and method: `[REQUIRED]`

> 這份簡短篩選只用來判斷是否符合研究條件與預先設定的名額。回答會存放在 `[REQUIRED: private system]`，僅限 `[REQUIRED: roles]` 存取，並依 `[REQUIRED: retention/deletion rule]` 處理。你可以選擇不回答或停止篩選；這不等同同意參加後續研究。若要查詢或刪除仍可連結到你的篩選資料，請聯絡 `[REQUIRED: contact]`。
>
> 若你先前曾向 `[REQUIRED: panel/omnibus owner]` 提供廣泛的內容或科技使用回答，本次篩選可能依原先已說明並允許的範圍，使用那些回答來配對資格與名額；不會在這裡揭露或重新詢問本研究要測的特定分類。若原先的說明不支援這項用途，就不會使用該資料。

- [ ] I received and understood the pre-screener privacy notice and agree to begin the optional screener.

If acknowledgment is not obtained, collect nothing further. Every optional question must include `Prefer not to answer` and must not be used to infer a sensitive attribute beyond the declared segmentation purpose.

### Neutral invitation

> 我們正在測試一個數位內容原型與研究流程。活動約需 `[REQUIRED: duration]` 分鐘，由研究員主持。這項篩選不保證入選，活動沒有標準答案。

Do not mention Taiwan basketball, magazine, archive, news, membership, crypto, Web3, wallet, or the expected T2 answer during the study-specific invitation or direct screener.

### Verbatim neutral eligibility questions

Ask these only after the pre-screener notice is acknowledged. Preserve the wording and answer order; do not add content-interest or technology-category questions.

1. > 你目前是否已滿 18 歲？`[是 / 否 / 不願回答]`
2. > 你是否能使用 `[REQUIRED: frozen study language]` 閱讀一般數位內容？`[是 / 否 / 不願回答]`
3. > 你是否曾經設計、開發、審查或測試過這次活動會使用的原型？`[是 / 否 / 不確定 / 不願回答]`
4. > 在收到這份邀請前，你是否看過這次活動的任務卡、預期答案或指定內容路徑？`[是 / 否 / 不確定 / 不願回答]`
5. > 你是否已參加過研究編號 `[REQUIRED: study ID]` 的同一輪活動？`[是 / 否 / 不確定 / 不願回答]`
6. > 若入選，你是否願意先閱讀參與說明，並只在自願同意後參加由研究員主持的數位內容活動？`[是 / 否 / 不確定 / 不願回答]`
7. > 你是否希望在同意參與後，私下討論文字大小、輸入方式或其他參與調整？`[是 / 否 / 不願回答]`

Questions 1–6 determine eligibility; any answer other than the unambiguous eligible answer is not eligible for this cohort. Question 7 never determines eligibility. Store only the minimum answer/disposition required by the declared screening purpose and apply the screen-out deletion rule.

### Eligibility gate

All must be true:

- [ ] The person is at least 18 years old.
- [ ] The person can read the frozen study language: `[REQUIRED: locale/language]`.
- [ ] The person can take part in a moderated digital-content session; detailed accommodation needs are discussed only after participation consent.
- [ ] The person did not design, build, review, or previously test this prototype.
- [ ] The person has not seen the task cards, coding rules, expected answer, or target article path.
- [ ] The person can provide participation consent before any task or observation begins.
- [ ] The person is a unique natural person and will occupy only one participant slot.

Accessibility needs are not an automatic exclusion. The direct screener may ask only whether the person wants a private accommodation discussion (`yes / no / prefer not to answer`), not request details. After participation consent, agree the accommodation privately. If it cannot be provided without revealing the answer, place the session on `HOLD`; do not record a participant failure.

### Blinded, study-independent segment assignment

Do not ask the participant the study-specific Taiwan-basketball or Web3 questions immediately before this study. Assign the segment from one of these preregistered sources:

1. `PRE_EXISTING_PANEL_ATTRIBUTE`: a participant-supplied attribute collected for a separate, study-independent purpose before this study invitation; or
2. `INDEPENDENT_NEUTRAL_OMNIBUS`: a separate recruiter's broad content/technology questionnaire covering multiple unrelated domains, with no target product, task, expected label, or study connection disclosed and a preregistered, prospectively justified non-zero washout of `[REQUIRED: duration]` before the session.

Required private source record:

- Segment-source mode: `[REQUIRED: PRE_EXISTING_PANEL_ATTRIBUTE / INDEPENDENT_NEUTRAL_OMNIBUS]`
- Source instrument/version: `[REQUIRED]`
- Attribute collection date/window: `[REQUIRED]`
- Separate recruiter/panel role: `[REQUIRED]`
- Original notice, declared purpose, and permission for this eligibility/selection reuse: `[REQUIRED]`
- Pre-screener notice version and acknowledged-at time: `[REQUIRED]`
- Reuse disposition: `[REQUIRED: REUSE_AUTHORIZED / REUSE_UNSUPPORTED]`
- Washout rule and result: `[REQUIRED]`
- Evidence that the direct study invitation/screener did not expose the target domain or classification labels: `[REQUIRED]`

`REUSE_UNSUPPORTED` forces `HOLD`. If the original notice or permission does not support this selection use, treat the source as unavailable. If a valid study-independent source is unavailable, the quota is not runnable and the study remains `HOLD`. Do not repair the gap by asking cueing questions immediately before T2. Do not request account names, addresses, assets, precise location, or unrelated demographics.

### Fixed segment quotas

Assign one primary segment from the blinded source before the session. The moderator receives only the random participant key and required accommodation, not the source answers. Do not reclassify after seeing task behavior.

| Primary segment code | n | Operational rule |
| --- | ---: | --- |
| `DEEP_TW_BASKETBALL_READER` | 2 | Follows Taiwan basketball at least weekly and reads long-form basketball content at least monthly. |
| `GENERAL_TW_BASKETBALL_FAN` | 2 | Follows Taiwan basketball at least monthly but does not meet the deep-reader rule. |
| `GENERAL_SPORTS_READER` | 1 | Uses digital sports content at least monthly but follows Taiwan basketball less than monthly. |
| `WEB3_FAMILIAR_STRESS` | 1 | Personally completed at least one wallet/signing/credential action in the past twelve months; this is the person's only reporting stratum. |

If a candidate fits multiple rows, use the first still-open quota determined by the preregistered assignment order: `[REQUIRED: assignment order]`. The Web3 slot is a stress-test segment and cannot be double-counted as another segment.

### Exclusion codes

Use only a fixed code in aggregate screening records:

- `UNDER_18`
- `LANGUAGE_REQUIREMENT_UNMET`
- `PRIOR_EXPOSURE`
- `TEAM_OR_MODERATOR_CONFLICT`
- `DUPLICATE_PERSON`
- `CONSENT_NOT_OBTAINED`
- `SESSION_REQUIREMENT_UNMET`
- `QUOTA_FILLED`

Screening failures never receive a study participant key and never enter T1/T2 denominators.

## B. Participation notice and consent

### Required document metadata

- Study title / ID: `[REQUIRED]`
- Consent version / effective date: `[REQUIRED]`
- Research lead role: `[REQUIRED]`
- Research contact: `[REQUIRED]`
- Privacy and deletion contact: `[REQUIRED]`
- Optional-permission revocation contact/method and cutoff: `[REQUIRED]`
- Questions or complaints contact, if applicable: `[REQUIRED or NOT APPLICABLE with owner]`
- Session duration: `[REQUIRED]`
- Compensation amount/form, timing, no-show, withdrawal, and technical-interruption rules: `[REQUIRED]`

### Participant-facing purpose

> 這次活動用來確認數位內容原型與 T1/T2 研究流程是否可執行，並找出導覽、理解或研究腳本的問題。這是六人的診斷性 pretest，不代表市場、廣泛讀者或商業價值。

### What participation involves

- A moderated session lasting about `[REQUIRED: duration]`.
- T1: find a specified article and begin reading it.
- T2: after about five minutes of product use, describe the product in your own words.
- The researcher may observe navigation, count activations and wrong turns, record T1 duration rounded to five-second buckets, record a categorical T2 prompt band (`early / on-time / late / not exposed`), and record whether a response began within the categorical 120-second window (`started / no response / refused / not applicable`). The study does not retain exact T2 timing, per-action timestamps, or precise reading/viewing history.
- If the participant answers T2, the study requires a restricted pseudonymous verbatim-text record of that first answer so two human reviewers can score the frozen rule. Accidental identifiers are redacted without changing semantic content. This scoring record is not permission to publish or quote the answer; skipping T2 remains allowed and is recorded as a no-response task outcome without changing the disclosed compensation rule.
- The study evaluates the product and research procedure, not the participant's knowledge or ability.

### Voluntary participation

> 參與完全自願。你可以略過問題、要求暫停，或隨時停止，不必說明理由，也不會因任務是否成功、回答內容或是否同意錄製而影響 `[REQUIRED: compensation rule]`。

> 「停止任務但保留資料」與「撤回同意並刪除資料」是兩個不同選項。若你要求停止，主持人會先停止活動，再中性確認你希望：(1) 停止今天的任務，但依本說明保留停止前已收集的資料；或 (2) 撤回參與同意，並在截止日前刪除仍可連結到你的研究資料。你也可以回答不確定；研究團隊不會自行替你選擇，資料會先隔離並等待依 `[REQUIRED: clarification route and deadline]` 處理。

> 要求暫停不等同撤回同意；但若暫停中斷固定計時的任務，該任務可能依預先規則記為未完成。這不影響 `[REQUIRED: compensation rule]`，你仍可選擇停止並保留資料，或撤回並刪除資料。

### Risks, controls, and expected benefit

- Possible discomfort includes navigation frustration, fatigue, and accidental exposure of notifications or personal information during screen sharing.
- Use a clean browser/demo profile, close notifications, and never enter real payment, login, identity, or private information.
- The study does not promise direct benefit and does not claim the product has already been validated.

### Participation and recording choices

Participation consent is required. Recording and quote permissions are separate, optional, and default to off. Refusing a recording choice must not prevent participation when manual observation can be used.

> 你可以透過 `[REQUIRED: contact/method]` 在 `[REQUIRED: cutoff]` 前，只撤回錄音、螢幕錄製或報告引用許可，而不撤回整體參與同意。研究團隊會停止並刪除該媒介或引用的可連結產物；仍受參與同意支持的人工觀察與評分文字依原規則處理。

- [ ] I confirm that I am at least 18 years old.
- [ ] I have read and understood the information above and had an opportunity to ask questions.
- [ ] I understand that, if I answer T2, my first answer will be kept as restricted verbatim text for scoring under the disclosed retention rule and will not be published as a quotation without separate permission.
- [ ] I voluntarily consent to participate and understand that I can stop.
- [ ] Optional: I consent to audio recording.
- [ ] Optional: I consent to screen recording.
- [ ] Optional: I consent to use of short, de-identified quotations in an authorized restricted internal report; the public Stage A receipt will not contain quotations.

Do not record camera video unless a separate, necessary purpose and explicit choice are added. Live screen viewing is not permission to store a recording.

Manual observation and the restricted T2 verbatim-text procedure are the Stage A fallback and must remain available when optional recording is declined. For each enabled audio or screen medium, complete and disclose: exact purpose, captured channels/scope, recording/transcription service or provider, recipients/subprocessors, storage region if relevant, access roles, retention/deletion rule, and whether automated transcription is used. Otherwise freeze every field as `NOT COLLECTED`; do not leave the capture path ambiguous.

### Data separation and minimization

The owner must complete this table before recruitment:

| Data class | Approved storage | Access roles | Retention/deletion |
| --- | --- | --- | --- |
| Contact, scheduling, compensation | `[REQUIRED: private system]` | `[REQUIRED]` | `[REQUIRED]` |
| Consent and participant linkage | `[REQUIRED: private system]` | `[REQUIRED]` | Retain through `[REQUIRED: withdrawal cutoff]`, then delete under `[REQUIRED: rule]` |
| Optional recordings/raw transcript | `[REQUIRED: private system or NOT COLLECTED]` | `[REQUIRED]` | `[REQUIRED]` |
| Restricted verbatim text of first T2 response | `[REQUIRED: restricted research store]` | `[REQUIRED: scoring reviewers only]` | `[REQUIRED]` |
| Pseudonymous working notes and row-level analysis | `[REQUIRED: restricted research store]` | `[REQUIRED]` | `[REQUIRED]` |
| Pre-cutoff aggregate/decision receipt | `[REQUIRED: private location]` | `[REQUIRED]` | Version privately through withdrawal cutoff |
| Post-cutoff irreversibly aggregated receipt | `[REQUIRED: location]` | `[REQUIRED]` | `[REQUIRED]` |

The public repository must not contain a name, email, signature, contact/compensation record, linkage table, participant/session key, row-level observation/analysis, consent or recording-choice Boolean, wallet address, IP/device identifier, session date, accommodation, exact location, raw audio/video, paraphrase/quotation, or identifiable transcript. A participant key must be random and must not be derived from identity values, but pseudonymization alone does not make a six-person row anonymous.

After the withdrawal cutoff, a separately authorized privacy-reviewed public aggregate may contain study/protocol/receipt versions, a sanitized frozen prototype commit/build/environment class, decision/date/owner role, overall retained `n=6`, overall T1/T2 `x/6` with exact intervals, T1 activation median/range, and non-identifying aggregate themes/limitations. It contains no participant row, segment cross-tab, response text, recording, or quotation.

### Withdrawal and deletion

> 你可以在 `[REQUIRED: withdrawal cutoff]` 前，使用 `[REQUIRED: private recruitment reference]` 聯絡 `[REQUIRED: deletion contact]`，要求停止參與並刪除仍可連結到你的資料。研究團隊會將可解析刪除請求所需的 linkage 分開保護並保留到該期限。期限後才會產生不可逆的公開彙總；屆時可能無法再辨識並移除個別貢獻。備份中的資料會依 `[REQUIRED: backup expiry]` 到期，若備份在此前復原，刪除清單會重新套用。任何依法或營運上必須保留的例外，必須在此處先具體揭露：`[REQUIRED or NONE]`。

If a person chooses `WITHDRAWN_DELETE_DATA` during the session, stop observation immediately. Do not score their tasks or retain their row. If they choose `STOPPED_RETAIN_DATA`, retain only the data already covered by participation consent and apply the task-failure rule. If intent is unclear, quarantine the row as `HOLD_FOR_WITHDRAWAL_CLARIFICATION`; do not infer either retention or deletion. Apply the denominator rule in `05-denominator-and-decision-rules.md` and the disclosed compensation policy.

The research owner must maintain a private artifact inventory and deletion log covering completed direct screeners, pre-screener acknowledgment, study-specific source extracts, derived eligibility/segment/quota assignment, source-to-recruitment linkage, contact/compensation data, consent/linkage, recordings, transcripts, T2 verbatim text, notes, observation rows, analysis rows, pre-cutoff receipts, caches, and backups. A valid request cascades through every study-linked artifact. Reusable source-panel attributes remain governed by their original notice, owner, access, and deletion route; the Stage A extract and linkage still follow this study's disclosed deletion path. Do not delete the resolution linkage before the withdrawal cutoff. Do not publish a result receipt to Git until the cutoff has passed and the aggregate-only export has completed privacy review.

### Private consent receipt fields

These fields belong in the private consent system, not a committed observation sheet:

- Private recruitment reference: `[REQUIRED]`
- Consent version: `[REQUIRED]`
- Captured at: `[REQUIRED: timestamp]`
- Capture method: `[REQUIRED: signed / electronic / verbal-documented]`
- Participation consent: `[REQUIRED: yes/no]`
- Mandatory T2 verbatim-scoring acknowledgment: `[REQUIRED: yes/no; participation consent is not complete unless yes]`
- Optional-permission version: `[REQUIRED]`
- Audio recording: `[NOT_ASKED / DECLINED / GRANTED / REVOKED]`; scope and granted/revoked-at: `[REQUIRED or NOT APPLICABLE]`
- Screen recording: `[NOT_ASKED / DECLINED / GRANTED / REVOKED]`; scope and granted/revoked-at: `[REQUIRED or NOT APPLICABLE]`
- De-identified restricted-report quote use: `[NOT_ASKED / DECLINED / GRANTED / REVOKED]`; scope and granted/revoked-at: `[REQUIRED or NOT APPLICABLE]`
- Unauthorized-recording incident reference: `[NONE or REQUIRED]`

Revoking audio/screen permission stops that medium immediately and cascade-deletes its artifacts/derivatives; revoking report-quote permission removes the quote and its report derivatives. Neither action deletes manual observations or the required T2 scoring text while participation consent remains valid. Recording without `GRANTED` permission requires immediate stop, deletion, an incident, and `CANCEL` of the affected run. Consent/permission version and state may appear only in the restricted working sheet. Public output is aggregate-only under the explicit allowlist in the decision receipt; no completed participant row is repository-safe.
