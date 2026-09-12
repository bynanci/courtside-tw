<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue"
import { fetchProvenance, type ProvenanceView } from "./provenance-api"

const props = defineProps<{ apiBaseUrl: string; issueSlug: string }>()
const state = ref<ProvenanceView | null>(null)
const loading = ref(false)
const unavailable = ref(false)
let controller: AbortController | null = null
const labels = {
  PENDING: "等待版本驗證",
  VERIFIED: "版本摘要已核對",
  FAILED: "版本驗證失敗",
  SUPERSEDED: "已有更新版本",
  WITHDRAWN: "此版本已撤回"
}
async function inspect() {
  controller?.abort()
  const active = new AbortController()
  controller = active
  loading.value = true
  unavailable.value = false
  state.value = null
  try {
    const result = await fetchProvenance(props.apiBaseUrl, props.issueSlug, active.signal)
    if (!active.signal.aborted) state.value = result
  } catch {
    if (!active.signal.aborted) unavailable.value = true
  } finally {
    if (!active.signal.aborted) loading.value = false
  }
}
watch(
  () => [props.issueSlug, props.apiBaseUrl],
  () => {
    controller?.abort()
    state.value = null
    loading.value = false
    unavailable.value = false
  }
)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <details class="provenance-panel">
    <summary>出版版本與來源</summary>
    <p>比對版本摘要，了解這份出版快照的紀錄。</p>
    <button type="button" :disabled="loading" @click="inspect">
      {{ loading ? "核對中…" : "查看版本紀錄" }}
    </button>
    <p v-if="unavailable" role="status">版本紀錄暫時無法取得，文章仍可正常閱讀。</p>
    <div v-if="state" aria-live="polite">
      <p>{{ labels[state.status] }}</p>
      <p v-if="state.locallyVerified">此裝置已重新計算並核對摘要。</p>
      <dl>
        <dt>出版快照</dt>
        <dd>{{ state.snapshotId }}</dd>
        <dt>SHA-256</dt>
        <dd class="provenance-panel__digest">{{ state.digest }}</dd>
        <template v-if="state.cid"
          ><dt>內容識別碼</dt>
          <dd class="provenance-panel__digest">{{ state.cid }}</dd></template
        >
        <template v-if="state.verifiedAt"
          ><dt>伺服器最後核對</dt>
          <dd>
            <time :datetime="state.verifiedAt">{{ state.verifiedAt }}</time>
          </dd></template
        >
      </dl>
    </div>
    <p class="provenance-panel__note">
      摘要僅確認版本一致性，不代表內容真實性或版權保證。已公開到公鏈或 IPFS
      的第三方副本無法保證刪除。
    </p>
  </details>
</template>

<style scoped>
.provenance-panel {
  margin-block: 2rem;
  padding-block: 1rem;
  border-block: 1px solid currentColor;
}
.provenance-panel summary {
  cursor: pointer;
  font-weight: 650;
}
.provenance-panel button {
  min-height: 44px;
  padding: 0.6rem 1rem;
  cursor: pointer;
}
.provenance-panel dt {
  font-weight: 600;
  margin-top: 1rem;
}
.provenance-panel dd {
  margin: 0.25rem 0;
}
.provenance-panel__digest {
  overflow-wrap: anywhere;
  font-family: monospace;
}
.provenance-panel__note {
  font-size: 0.875rem;
  line-height: 1.7;
}
</style>
