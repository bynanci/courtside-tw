<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue"
import { createPassportApi } from "./passport-api"
import {
  createPassportController,
  stampStatusLabel,
  type PassportState
} from "./passport-controller"

const props = defineProps<{ apiBaseUrl: string }>()
const controller = createPassportController({
  api: createPassportApi({ apiBaseUrl: props.apiBaseUrl })
})
const state = shallowRef<PassportState>(controller.getState())
const selected = computed(() =>
  state.value.issues.find((issue) => issue.issueId === state.value.selected)
)
const messages = {
  AUTH_REQUIRED: "登入已到期，請重新登入原本的帳號後再操作。",
  FORBIDDEN: "無法確認這次操作的權限，請重新登入後再試。",
  NOT_ELIGIBLE:
    "本期尚未符合領取條件，或申請狀態已變更。請確認已完成最新版本各篇文章的閱讀確認，稍後再試。",
  RATE_LIMITED: "操作較頻繁，請稍候再試。",
  UNAVAILABLE: "服務暫時無法確認這次申請。重試會沿用同一次申請，不會重複領取。",
  INVALID_RESPONSE: "暫時無法確認護照資料，請重新整理。"
}
let unsubscribe: (() => void) | undefined
onMounted(() => {
  unsubscribe = controller.subscribe((value) => {
    state.value = value
  })
  void controller.load()
})
onBeforeUnmount(() => {
  unsubscribe?.()
  controller.dispose()
})
function choose(event: Event) {
  controller.select((event.target as HTMLSelectElement).value)
}
function consent(event: Event) {
  controller.consent((event.target as HTMLInputElement).checked)
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(
    new Date(value)
  )
}
</script>

<template>
  <section class="passport-panel" aria-labelledby="passport-heading" data-testid="reader-passport">
    <p class="eyebrow">Reader Passport</p>
    <h2 id="passport-heading">我的賽季護照</h2>
    <p>用原本的帳號收藏閱讀印章，不需要錢包。這是私人閱讀紀錄，免費閱讀不受影響。</p>
    <div class="passport-actions">
      <button type="button" :disabled="state.busy" @click="controller.load()">重新整理護照</button>
      <NuxtLink to="/issues">繼續閱讀</NuxtLink>
    </div>
    <p v-if="state.busy" role="status">正在確認護照資料…</p>
    <p v-if="state.error" class="passport-error" role="alert">
      {{ messages[state.error] }}
      <a
        v-if="state.error === 'AUTH_REQUIRED' || state.error === 'FORBIDDEN'"
        href="/auth/login?returnTo=%2Fsettings%2Fprivacy"
        >重新登入</a
      >
    </p>

    <h3>已收藏的印章</h3>
    <p>以下為最近向伺服器確認的狀態；撤銷、版本更替或到期後，印章會保留紀錄並標示狀態。</p>
    <p v-if="state.stampsError">目前無法確認印章清單，請重新整理。</p>
    <p v-else-if="!state.busy && state.items.length === 0">尚未收藏閱讀印章。</p>
    <ul v-if="state.items.length" class="passport-stamps">
      <li v-for="stamp in state.items" :key="stamp.id" data-testid="reader-stamp">
        <div class="passport-stamp-heading">
          <h4>{{ stamp.season }} 賽季 · 閱讀印章</h4>
          <strong>{{ stampStatusLabel(stamp) }}</strong>
        </div>
        <p>建立於 {{ dateLabel(stamp.issuedAt) }} · 到期日 {{ dateLabel(stamp.expiresAt) }}</p>
        <small>印章編號 {{ stamp.id }}</small>
      </li>
    </ul>

    <template v-if="state.error !== 'AUTH_REQUIRED' && state.error !== 'FORBIDDEN'">
      <h3>領取本期閱讀印章</h3>
      <p>
        先在本期每篇文章底部選擇「確認本篇閱讀完成」。申請時會核對最新發布版本、帳號的完成紀錄與內容權利；閱讀確認不代表理解程度。
      </p>
      <p v-if="state.issuesError" role="alert">
        期數清單暫時無法更新，請重新整理；下方已載入的期數仍可查看。
      </p>
      <label class="passport-label" for="passport-issue">選擇已閱讀的期數</label>
      <select
        id="passport-issue"
        :value="state.selected"
        :disabled="state.busy || !state.issues.length"
        @change="choose"
      >
        <option value="" disabled>請選擇期數</option>
        <option v-for="issue in state.issues" :key="issue.issueId" :value="issue.issueId">
          {{ issue.title }} · {{ issue.season }} 賽季
        </option>
      </select>
      <p v-if="!state.busy && !state.issuesError && !state.issues.length">
        目前沒有可供申請的公開期數。
      </p>
      <button
        v-if="state.nextCursor"
        type="button"
        :disabled="state.busy"
        @click="controller.moreIssues()"
      >
        載入更多期數
      </button>
      <p v-if="selected">
        <NuxtLink :to="'/issues/' + selected.slug">查看所選期數與文章目錄</NuxtLink>
      </p>
      <label class="passport-consent">
        <input
          type="checkbox"
          :checked="state.consent"
          :disabled="state.busy || !selected"
          @change="consent"
        />
        我同意核對這一期的閱讀完成紀錄，並將印章保存在我的帳號
      </label>
      <button
        type="button"
        :disabled="state.busy || !selected || !state.consent"
        @click="controller.claim()"
      >
        {{ state.error === "UNAVAILABLE" ? "重試這次領取" : "確認並申請領取" }}
      </button>
      <p v-if="state.result" role="status" data-testid="passport-claim-result">
        這次申請的印章狀態：{{ stampStatusLabel(state.result) }}。
      </p>
      <p class="passport-note">
        重複申請會取得同一份有效紀錄。此處只保存帳號內的印章，不會公開閱讀歷史或發送鏈上交易。
      </p>
    </template>
  </section>
</template>

<style scoped>
.passport-panel {
  margin-bottom: 2rem;
  border-top: 1px solid var(--color-text-primary);
  padding-top: 1.5rem;
}
.passport-panel h2,
.passport-panel h4 {
  margin: 0;
}
.passport-panel h3 {
  margin-block: 1.75rem 0.75rem;
}
.passport-panel button,
.passport-panel select {
  min-height: 44px;
  max-width: 100%;
  border: 1px solid var(--color-text-primary);
  padding: 0.65rem 0.9rem;
  background: var(--color-surface, white);
  color: var(--color-text-primary);
  font: inherit;
}
.passport-panel button {
  cursor: pointer;
}
.passport-panel button:disabled {
  opacity: 0.55;
  cursor: default;
}
.passport-panel :is(button, select, input, a):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.passport-actions,
.passport-stamp-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
}
.passport-actions {
  justify-content: flex-start;
}
.passport-stamps {
  list-style: none;
  padding: 0;
}
.passport-stamps li {
  border-block-end: 1px solid var(--color-border, #ccc);
  padding-block: 1rem;
}
.passport-stamps small {
  overflow-wrap: anywhere;
}
.passport-label {
  display: block;
  margin-bottom: 0.5rem;
}
.passport-consent {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin-block: 1rem;
}
.passport-consent input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}
.passport-note {
  font-size: 0.875rem;
}
.passport-error {
  color: var(--color-danger);
}
</style>
