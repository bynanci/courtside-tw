<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
import { createWalletApi } from "./wallet-api"
import {
  createWalletLinkController,
  type WalletLink,
  type WalletLinkController,
  type WalletState
} from "./wallet-link"

const props = defineProps<{ chainId: string }>()
const consent = ref(false)
const unlinkTarget = ref<WalletLink | null>(null)
const state = shallowRef<WalletState>({
  status: "idle",
  error: null,
  challenge: null,
  connection: null,
  links: [],
  linksError: false
})
let controller: WalletLinkController | null = null
let unsubscribe: (() => void) | null = null
const busy = computed(() =>
  ["connecting", "signing", "verifying", "unlinking"].includes(state.value.status)
)
const configured = computed(() => /^eip155:[1-9][0-9]*$/u.test(props.chainId))
const messages: Record<string, string> = {
  USER_REJECTED: "你已取消錢包操作，可以隨時再試。",
  UNAUTHORIZED: "錢包尚未允許存取這個帳戶，請在錢包中確認權限。",
  DISCONNECTED: "錢包已離線，恢復連線後可重新操作。",
  WRONG_CHAIN: "錢包網路不符。請自行切換至下方指定網路，再重新連結。",
  PROVIDER_UNAVAILABLE: "目前找不到支援的錢包。你仍可使用原本的帳號與閱讀功能。",
  PROVIDER_TIMEOUT: "錢包沒有及時回應，請關閉未完成的錢包請求後再試。",
  CHAIN_NOT_CONFIGURED: "錢包連結尚未開放。",
  INVALID_CHALLENGE: "簽章內容不符合本站或已過期，請重新開始連結。",
  CONSENT_REQUIRED: "請先確認連結用途，再開啟錢包簽章。",
  WALLET_CHANGED:
    "錢包帳戶、網路或連線已變更，請重新驗證。已送出的連結申請可能已完成，請查看下方已連結錢包。",
  UNLINK_FAILED: "尚未解除連結。請重新登入確認身分後再試。",
  LINK_NOT_CREATED: "簽章已驗證，但帳號尚未建立連結，請稍後再試。"
}
const errorMessage = computed(() =>
  state.value.error
    ? (messages[state.value.error] ?? "錢包服務暫時無法完成操作，請稍後再試。")
    : null
)

onMounted(() => {
  controller = createWalletLinkController({
    provider: () => (window as Window & { ethereum?: unknown }).ethereum,
    origin: window.location.origin,
    chainId: props.chainId,
    api: createWalletApi()
  })
  unsubscribe = controller.subscribe((value) => {
    state.value = value
    if (value.status !== "consent") consent.value = false
  })
  void controller.refreshLinks()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  controller?.dispose()
})

async function connect(): Promise<void> {
  consent.value = false
  await controller?.connect()
}
async function sign(): Promise<void> {
  await controller?.sign(consent.value)
}
async function refreshLinks(): Promise<void> {
  await controller?.refreshLinks()
}
function cancel(): void {
  controller?.cancel()
  consent.value = false
}
async function unlink(): Promise<void> {
  if (!unlinkTarget.value) return
  await controller?.unlink(unlinkTarget.value, true)
  unlinkTarget.value = null
}
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
</script>

<template>
  <section class="wallet-panel" aria-labelledby="wallet-heading" data-testid="wallet-settings">
    <h2 id="wallet-heading">選擇是否連結錢包</h2>
    <p>連結會將公開錢包地址與你的讀者帳號關聯。這是選用功能，不影響免費閱讀與原本的登入方式。</p>
    <p v-if="configured" class="wallet-meta">指定網路：{{ props.chainId }}</p>
    <p v-else>錢包連結尚未開放。已存在的連結仍可在下方解除。</p>

    <div
      v-if="state.status === 'consent' && state.challenge && state.connection"
      class="wallet-consent"
    >
      <h3>確認這次簽章</h3>
      <p>網站：{{ state.challenge.domain }} · 帳戶：{{ shortAddress(state.connection.address) }}</p>
      <p>簽章用來證明錢包由你操作並建立帳號連結，不會要求轉帳或授權代幣支出。</p>
      <details>
        <summary>查看完整簽章內容</summary>
        <pre>{{ state.challenge.message }}</pre>
      </details>
      <label class="wallet-confirm">
        <input v-model="consent" type="checkbox" />
        我同意將這個錢包地址連結至我的讀者帳號
      </label>
      <div class="wallet-actions">
        <button type="button" :disabled="!consent" @click="sign">開啟錢包並簽章</button>
        <button type="button" @click="cancel">取消連結</button>
      </div>
    </div>
    <button v-else-if="!busy && configured" type="button" @click="connect">選擇錢包並連結</button>

    <p v-if="busy" role="status">
      {{
        state.status === "verifying"
          ? "正在確認簽章與連結…"
          : state.status === "unlinking"
            ? "正在解除連結…"
            : "請在錢包中確認操作…"
      }}
    </p>
    <p v-if="state.status === 'linked'" role="status">錢包已連結至你的讀者帳號。</p>
    <p v-if="errorMessage" class="wallet-error" role="alert">{{ errorMessage }}</p>

    <h3>已連結錢包</h3>
    <p v-if="state.linksError" role="alert">
      暫時無法取得連結狀態。
      <button type="button" :disabled="busy" @click="refreshLinks">重新整理</button>
    </p>
    <p v-else-if="state.links.length === 0">目前沒有已連結錢包。</p>
    <ul v-else class="wallet-links">
      <li v-for="link in state.links" :key="`${link.chainNamespace}:${link.address}`">
        <span class="wallet-address">{{ link.address }}</span>
        <button
          type="button"
          :disabled="busy"
          :aria-label="`解除錢包 ${shortAddress(link.address)} 的連結`"
          @click="unlinkTarget = link"
        >
          解除連結
        </button>
      </li>
    </ul>
    <div v-if="unlinkTarget" class="wallet-consent">
      <p>
        確認解除
        {{ shortAddress(unlinkTarget.address) }} 與帳號的連結？閱讀與原本的帳號登入不受影響。
      </p>
      <div class="wallet-actions">
        <button type="button" :disabled="busy" @click="unlink">確認解除連結</button>
        <button type="button" :disabled="busy" @click="unlinkTarget = null">保留連結</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wallet-panel {
  margin-bottom: 2rem;
  border-top: 1px solid var(--color-text-primary);
  padding-top: 1.5rem;
}
.wallet-panel h2 {
  margin: 0;
}
.wallet-panel h3 {
  margin-block: 1.5rem 0.75rem;
}
.wallet-panel button {
  min-height: 44px;
  border: 1px solid var(--color-text-primary);
  padding: 0.6rem 1rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.wallet-panel button:disabled {
  opacity: 0.55;
  cursor: default;
}
.wallet-panel button:focus-visible,
.wallet-panel summary:focus-visible,
.wallet-panel input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.wallet-consent {
  padding-block: 1rem;
  border-block: 1px solid var(--color-text-primary);
}
.wallet-confirm {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-block: 1rem;
}
.wallet-confirm input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}
.wallet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.wallet-meta {
  font-size: 0.875rem;
}
.wallet-consent pre {
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
}
.wallet-links {
  list-style: none;
  padding: 0;
}
.wallet-links li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  padding-block: 0.75rem;
}
.wallet-address {
  flex: 1 1 15rem;
  overflow-wrap: anywhere;
  font-family: monospace;
}
.wallet-error {
  color: var(--color-danger);
}
</style>
