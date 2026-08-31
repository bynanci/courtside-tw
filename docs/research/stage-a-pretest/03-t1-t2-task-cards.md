# Stage A T1/T2 task cards

**Status**: BLANK CARDS / NOT EXECUTED<br>
**Rule**: render each participant-facing card into a separate participant-only view; show one at a time and never screen-share this source file or scoring notes

Before the first participant, replace `[FROZEN_TARGET_ARTICLE_TITLE]` once, record the card version, and use the identical text for all retained sessions. A title change creates a new study version and cannot be pooled with the first cohort.

---

## Participant card — T1

### 找到指定內容

請從目前這個畫面找到「**[FROZEN_TARGET_ARTICLE_TITLE]**」這篇內容，並開始閱讀。

請依你平常的方式操作；過程中盡量說出你正在找什麼，以及你以為下一步會發生什麼。

當你認為已開始閱讀時，請說「**完成**」。

---

## Moderator-only scoring card — T1

Do not show this section to the participant.

- Timer starts when the spoken/written prompt ends.
- After the T1 endpoint/setup, read the frozen common exposure instruction from the moderator script. The standardized five-minute exposure timer starts at the later of instruction completion and frozen title/body readability.
- T2 is scoring-eligible only when that instruction is verbatim and the same frozen article route/body remains continuously active/readable through the prompt; use the exposure-validity matrix for every interruption.
- Operational cap: the frozen completion signal must occur before `180.000s`; timeout wins an exact tie.
- Independent success requires the frozen target article title/body to be readable and the participant to give the frozen "完成" signal or preregistered accessible equivalent, without prohibited assistance.
- A timeout, give-up, abandonment, or prohibited navigation help is a T1 failure.
- A product crash or broken product path is a failure, not a removable lab error.
- A valid alternative path is not a wrong turn.
- Retain only elapsed seconds rounded to the nearest 5, not exact timestamps or a per-action trace.
- Apply and record the moderator script's fixed prompt cadence: no prompt in the first 20 seconds, at most two triggered neutral prompts, and at most one participant-requested verbatim reread.

### Activation definition

Count one activation for each intentional invocation of an actionable product navigation/state control after the task begins, whether or not the product responds. Record any missing response separately. Count:

- mouse click or tap on an actionable product element;
- Enter/Space or assistive-technology invocation of an actionable product element;
- participant-initiated Back/Forward navigation;
- opening or closing product navigation used to find the target.

Do not count scrolling, pointer movement, typing individual characters, focus-only movement, zoom, or duplicated telemetry for one state change. When one gesture fires multiple events, count one activation. Do not retain a focus/action timeline.

### Wrong-turn definition

Count a wrong turn only when an activation leads to a non-target surface and at least one of these is observed:

- the participant explicitly says it was not what they wanted;
- the participant reverses solely to recover from that path;
- the path reaches a dead end unrelated to the target task.

Do not count an alternate valid route, exploratory scroll, or researcher-preferred-path deviation by itself.

---

## Participant card — T2

### 用自己的話描述產品

先不用再操作。請用你自己的話說明：

**你覺得剛才使用的產品是什麼？**

---

## Moderator-only coding card — T2

Do not show this section or its labels to the participant. Code the locked restricted verbatim text only when T2 outcome is `SCORED_ON_TIME`, meaning the T2 prompt began in the frozen timing band and no other terminal `FAIL_*` condition occurred. The first response must begin within 120 seconds after the prompt ends, but answer latency does not change the prompt timing band. Every non-scored `FAIL_*` outcome—including `FAIL_CLASSIFICATION_CONTAMINATION`—uses `t2_coding_status=NOT_APPLICABLE_NON_SCORED`, leaves classification/reviewer fields null, and has final recognition `false`. Follow-up answers are diagnostic only.

`HOLD_FOR_WITHDRAWAL_CLARIFICATION` is quarantined, not scored: coding status, response, reviewer, classification, and final-recognition fields remain null until intent resolves.

`HOLD_FOR_EXPOSURE_VALIDITY_REVIEW` is also not scored: any already consented/captured response remains restricted, but coding/reviewer/classification/final-recognition fields stay null until independent validity review resolves the outcome.

`Unaided` means the study-specific invitation, direct screener, consent, moderator, and task card did not expose Taiwan basketball or any publication/Web3 classification label. Segment attributes come from the blinded study-independent source. Apply the frozen boundary rule to a direct cue: isolated before first activation means exclude/replace; isolated after that boundary means retained `FAIL_CLASSIFICATION_CONTAMINATION`; the same cue/process in two or more sessions means systemic `CANCEL`.

### Primary natural-classification code

Choose exactly one:

- `MAGAZINE`
- `ARCHIVE`
- `NEWS_FEED`
- `MEMBERSHIP`
- `CRYPTO_PRODUCT`
- `OTHER`
- `UNCLEAR_OR_NO_RESPONSE`

For a mixed answer, use the participant's explicit overall/main label. If the locked wording gives two or more models equal status and no main label, code `OTHER`; do not choose the category most favorable to the gate. Classification counts include only `SCORED_ON_TIME` rows.

### Recognition gate

Set `t2_recognition=true` only when the unaided response contains both:

1. Taiwan basketball as the content domain, including an unambiguous natural-language equivalent; and
2. an editorial digital magazine, archive, curated issue/collection, or historical-record model.

`basketball website`, `sports app`, `article page`, `membership`, `news feed`, `NFT`, `wallet`, or `crypto product` alone does not pass. Freeze acceptable semantic equivalents before session 1; do not add a new equivalent because it improves the result.

A mixed answer that gives a non-qualifying model equal status does not pass unless the locked wording explicitly resolves the product's main/overall model as the qualifying magazine/archive/curated-history model.

Two human reviewers independently code the locked restricted verbatim text without seeing each other's code. Record reviewer A/B codes, disagreement, final adjudicated code/gate, and resolution reference before aggregate results are unblinded. A diagnostic paraphrase is not scoring evidence. An unresolved disagreement is `HOLD`, not an assumed pass.
