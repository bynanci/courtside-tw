<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue"
import ContentDocumentRenderer from "../../../components/content-blocks/ContentDocumentRenderer.vue"

import StudioShell from "../StudioShell.vue"
import { canStudioAction, missingRoleMessage } from "../studio-rbac"
import {
  getEditorArticle,
  patchEditorArticle,
  submitArticle,
  StudioApiError,
  getArticleCredits,
  setArticleCredits,
  listContributors,
  getPrivateMediaPreview,
  type ArticleCredit,
  type ManagedContributor
} from "../studio-api"
import {
  buildCreditAssignments,
  moveCredit,
  parsePrivatePreview,
  type CreditRole
} from "./article-draft-form"
import type { StudioArticleDraft, StudioRole } from "../studio-contract"
import { articleStateLabel, readinessLabel, roleLabel } from "../studio-contract"
import {
  boundedGenerativePrompt,
  parseContentDocument,
  serializeContentDocument
} from "./content-editor"

const props = defineProps<{
  role: StudioRole
  draft: StudioArticleDraft
}>()

const current = ref<StudioArticleDraft>(props.draft)
const title = ref(props.draft.title)
const dek = ref(props.draft.dek ?? "")
const contentJson = ref(safeSerialize(props.draft.content))
const saveMessage = ref("尚未儲存")
const conflict = ref(false)
const localDraftKept = ref(false)
const contentError = ref<string | null>(null)
const apiError = ref<string | null>(null)
const generativePrompt = ref("")
const busy = ref(false)
const creditRoles: CreditRole[] = [
  "AUTHOR",
  "EDITOR",
  "PHOTOGRAPHER",
  "ILLUSTRATOR",
  "TRANSLATOR",
  "DESIGNER"
]
const credits = ref<ArticleCredit[]>([])
const contributors = ref<ManagedContributor[]>([])
const selectedContributor = ref("")
const selectedCreditRole = ref<CreditRole>("AUTHOR")
const creditError = ref<string | null>(null)
const creditMessage = ref("")
const creditsReady = ref(false)
const savedCredits = ref("[]")
const creditsDirty = computed(() => JSON.stringify(credits.value) !== savedCredits.value)
const previewVisible = ref(false)
const preview = computed(() => parsePrivatePreview(contentJson.value))
const previewBlocks = computed(
  () =>
    preview.value.document?.blocks.map((block) => ({ ...block, payload: { ...block.payload } })) ??
    []
)
const previewUrls = ref<Record<string, string>>({})
const previewFailures = ref(new Set<string>())
const previewMediaMessage = ref("")
let previewController: AbortController | null = null

function clearPreviewMedia() {
  previewController?.abort()
  previewController = null
  Object.values(previewUrls.value).forEach((url) => URL.revokeObjectURL(url))
  previewUrls.value = {}
  previewFailures.value = new Set()
}

async function loadPreviewMedia() {
  clearPreviewMedia()
  if (!previewVisible.value || !preview.value.document) return
  const controller = new AbortController()
  previewController = controller
  const ids = new Set<string>()
  for (const block of preview.value.document.blocks) {
    if (block.type === "image") ids.add(block.payload.assetId)
    if (block.type === "gallery") block.payload.items.forEach((item) => ids.add(item.assetId))
    if (block.type === "generative-canvas") ids.add(block.payload.posterAssetId)
  }
  previewMediaMessage.value = ids.size ? "正在讀取私人圖片預覽…" : ""
  const pending = [...ids]
  let failures = 0
  await Promise.all(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (pending.length && !controller.signal.aborted) {
        const id = pending.shift()!
        try {
          const blob = await getPrivateMediaPreview(id, controller.signal)
          if (!controller.signal.aborted) previewUrls.value[id] = URL.createObjectURL(blob)
        } catch {
          if (!controller.signal.aborted) failures++
        }
      }
    })
  )
  if (!controller.signal.aborted)
    previewMediaMessage.value = failures
      ? `${failures} 張圖片目前無法取得私人預覽，以下保留替代文字。`
      : ""
}
const previewAssetUrl = (id: unknown) =>
  typeof id === "string" ? (previewUrls.value[id] ?? "") : ""
const previewAssetDimension = () => undefined
const previewAssetAttribution = (_id: unknown, _variant?: string, credit?: unknown) =>
  typeof credit === "string" ? credit : ""
const previewRelatedLink = (slug: unknown) =>
  typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) ? `/articles/${slug}` : null
const noCreativePlayback = () => {}

async function loadCredits() {
  creditsReady.value = false
  creditError.value = null
  try {
    const result = await getArticleCredits(current.value.articleId, current.value.revisionId)
    if (result.version !== current.value.version)
      throw new Error("文章版本已變更，請重新讀取文章後再安排署名。")
    credits.value = result.contributors
    savedCredits.value = JSON.stringify(result.contributors)
    creditsReady.value = true
  } catch (cause) {
    creditError.value = cause instanceof Error ? cause.message : "無法讀取署名。"
  }
}
function addCredit() {
  const person = contributors.value.find((item) => item.contributorId === selectedContributor.value)
  if (!person || !canEdit.value || !creditsReady.value) return
  const updated = [
    ...credits.value,
    {
      contributorId: person.contributorId,
      slug: person.slug,
      displayName: person.displayName,
      role: selectedCreditRole.value
    }
  ]
  try {
    buildCreditAssignments(updated)
    credits.value = updated
    creditError.value = null
  } catch (cause) {
    creditError.value = cause instanceof Error ? cause.message : "署名無效。"
  }
}
async function saveCredits() {
  if (!canEdit.value || busy.value || !creditsReady.value) return
  busy.value = true
  creditError.value = null
  try {
    const payload = buildCreditAssignments(credits.value)
    const result = await setArticleCredits(
      current.value.articleId,
      current.value.revisionId,
      current.value.version,
      payload.contributors
    )
    current.value = { ...current.value, version: result.version }
    credits.value = result.contributors
    savedCredits.value = JSON.stringify(result.contributors)
    creditMessage.value = "署名與順序已儲存。"
  } catch (cause) {
    handleApiError(cause)
    creditError.value = cause instanceof Error ? cause.message : "無法儲存署名。"
  } finally {
    busy.value = false
  }
}
onMounted(async () => {
  await loadCredits()
  try {
    contributors.value = (await listContributors()).items
  } catch (cause) {
    creditError.value = cause instanceof Error ? cause.message : "無法讀取作者清單。"
  }
})
watch([previewVisible, contentJson], loadPreviewMedia)
onBeforeUnmount(clearPreviewMedia)
const savedFingerprint = ref(
  editorFingerprint(props.draft.title, props.draft.dek ?? "", contentJson.value)
)

const boundedPrompt = computed(() => boundedGenerativePrompt(generativePrompt.value))
const canEdit = computed(
  () => canStudioAction(props.role, "edit") && current.value.state === "DRAFT"
)
const canSubmit = computed(
  () => canStudioAction(props.role, "submit") && current.value.state === "DRAFT"
)
const isDirty = computed(
  () =>
    editorFingerprint(title.value, dek.value, contentJson.value) !== savedFingerprint.value ||
    creditsDirty.value
)

function applyArticle(article: StudioArticleDraft): void {
  current.value = article
  title.value = article.title
  dek.value = article.dek ?? ""
  contentJson.value = safeSerialize(article.content)
  savedFingerprint.value = editorFingerprint(title.value, dek.value, contentJson.value)
}

async function saveDraft(): Promise<void> {
  if (!canEdit.value || busy.value) return
  const parsed = parseContentDocument(contentJson.value)
  if (parsed.error || !parsed.document) {
    contentError.value = parsed.error ?? "內容 schema 驗證失敗"
    saveMessage.value = "內容 schema 驗證失敗"
    return
  }
  contentError.value = null
  apiError.value = null
  conflict.value = false
  localDraftKept.value = false
  busy.value = true
  try {
    const updated = await patchEditorArticle(current.value.articleId, current.value.version, {
      title: title.value,
      dek: dek.value,
      content: parsed.document
    })
    applyArticle(updated)
    saveMessage.value = `已保存 revision ${updated.revisionNumber}；If-Match 版本 ${updated.version}`
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

async function submitForReview(): Promise<void> {
  if (!canSubmit.value || busy.value) return
  if (isDirty.value) {
    apiError.value = "尚有未儲存的編輯；請先按 Save，再送出審核。"
    saveMessage.value = "送審已暫停：請先儲存目前草稿。"
    return
  }
  apiError.value = null
  busy.value = true
  try {
    await submitArticle(current.value.articleId, current.value.revisionId)
    await refreshFromApi()
    saveMessage.value = "已送出 review；publisher 將看到同一個 frozen revision。"
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

async function refreshFromApi(): Promise<void> {
  applyArticle(await getEditorArticle(current.value.articleId))
  await loadCredits()
}

function retrySave(): void {
  void saveDraft()
}

async function reloadDraft(): Promise<void> {
  if (busy.value) return
  busy.value = true
  apiError.value = null
  try {
    await refreshFromApi()
    conflict.value = false
    localDraftKept.value = false
    saveMessage.value = `已重新讀取 revision ${current.value.revisionNumber}；請比較後再儲存。`
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

function keepLocalDraft(): void {
  localDraftKept.value = true
  conflict.value = false
  saveMessage.value = "本機草稿已保留；請重新讀取後比較，再以最新版本重試。"
}

function insertBoundedSuggestion(): void {
  generativePrompt.value = boundedPrompt.value
  if (!generativePrompt.value) {
    generativePrompt.value = "請以採訪原文為界，提出一個可人工審核的段落結構建議。"
  }
}

function handleApiError(error: unknown): void {
  if (error instanceof StudioApiError && error.status === 409) {
    conflict.value = true
    localDraftKept.value = false
    saveMessage.value = "409 VERSION_CONFLICT：伺服器已有較新的 revision"
    apiError.value = error.message
    return
  }
  apiError.value = error instanceof Error ? error.message : "Studio API 請求失敗。"
  saveMessage.value = apiError.value
}

function safeSerialize(value: unknown): string {
  try {
    return serializeContentDocument(value)
  } catch {
    return JSON.stringify(value ?? {}, null, 2)
  }
}

function editorFingerprint(titleValue: string, dekValue: string, contentValue: string): string {
  return `${titleValue}\u0000${dekValue}\u0000${contentValue}`
}
</script>

<template>
  <StudioShell
    :role="role"
    active="articles"
    :article-id="current.articleId"
    audit-target-type="ARTICLE"
    :audit-target-id="current.articleId"
    title="文章編輯 Article editor"
    eyebrow="Studio / Article"
    description="把內容寫成可審核的 revision；儲存、送審與衝突處理都經過 OIDC session 與 API。"
  >
    <template #header-actions>
      <div class="studio-header-status" aria-label="文章狀態">
        <span class="studio-status-dot studio-status-dot--draft" aria-hidden="true" />
        {{ articleStateLabel(current.state) }} · {{ roleLabel(role) }}
      </div>
    </template>

    <section class="studio-grid studio-grid--editor" aria-label="文章編輯工作區">
      <form class="studio-panel studio-panel--primary" @submit.prevent="saveDraft">
        <div class="studio-panel__heading">
          <div>
            <p class="studio-kicker">Revision {{ current.revisionNumber }}</p>
            <h2>先把文章說清楚</h2>
          </div>
          <span class="studio-version">If-Match v{{ current.version }}</span>
        </div>

        <div class="studio-form-grid">
          <label class="studio-field studio-field--wide" for="studio-article-title">
            <span>標題 Title</span>
            <input
              id="studio-article-title"
              v-model="title"
              required
              maxlength="250"
              :disabled="!canEdit || busy"
            />
          </label>
          <label class="studio-field studio-field--wide" for="studio-article-dek">
            <span>導讀 Dek</span>
            <textarea
              id="studio-article-dek"
              v-model="dek"
              rows="3"
              maxlength="1000"
              :disabled="!canEdit || busy"
            />
          </label>
          <label class="studio-field studio-field--wide" for="studio-content-json">
            <span>ContentDocument v1</span>
            <textarea
              id="studio-content-json"
              v-model="contentJson"
              class="studio-code-field"
              rows="13"
              spellcheck="false"
              aria-describedby="studio-content-help"
              :disabled="!canEdit || busy"
            />
          </label>
        </div>
        <p id="studio-content-help" class="studio-help">
          內容只接受固定 schema；不把任意 HTML 或未核准的生成結果直接送進發布路徑。
        </p>
        <fieldset :disabled="!canEdit || busy || !creditsReady" aria-label="文章署名">
          <legend>文章署名與順序</legend>
          <div class="studio-form-grid">
            <label class="studio-field"
              ><span>選擇作者</span
              ><select v-model="selectedContributor">
                <option value="">選擇使用中的作者</option>
                <option
                  v-for="person in contributors"
                  :key="person.contributorId"
                  :value="person.contributorId"
                >
                  {{ person.displayName }}
                </option>
              </select></label
            >
            <label class="studio-field"
              ><span>署名角色</span
              ><select v-model="selectedCreditRole">
                <option v-for="creditRole in creditRoles" :key="creditRole" :value="creditRole">
                  {{ creditRole }}
                </option>
              </select></label
            >
            <button
              class="studio-button studio-button--quiet"
              type="button"
              :disabled="!selectedContributor"
              @click="addCredit"
            >
              加入署名
            </button>
          </div>
          <ol aria-label="已安排署名" class="studio-audit-list">
            <li v-for="(credit, index) in credits" :key="`${credit.contributorId}:${credit.role}`">
              <span>{{ index + 1 }}</span>
              <div>
                <strong>{{ credit.displayName }}</strong
                ><small>{{ credit.role }}</small>
              </div>
              <div class="studio-action-row">
                <button
                  class="studio-icon-button"
                  type="button"
                  :disabled="index === 0"
                  :aria-label="`上移署名 ${credit.displayName}`"
                  @click="credits = moveCredit(credits, index, -1)"
                >
                  ↑
                </button>
                <button
                  class="studio-icon-button"
                  type="button"
                  :disabled="index === credits.length - 1"
                  :aria-label="`下移署名 ${credit.displayName}`"
                  @click="credits = moveCredit(credits, index, 1)"
                >
                  ↓
                </button>
                <button
                  class="studio-icon-button"
                  type="button"
                  :aria-label="`移除署名 ${credit.displayName}`"
                  @click="credits = credits.filter((_, position) => position !== index)"
                >
                  ×
                </button>
              </div>
            </li>
          </ol>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!creditsDirty"
            @click="saveCredits"
          >
            儲存署名順序
          </button>
        </fieldset>
        <p v-if="creditError" class="studio-inline-error" role="alert">{{ creditError }}</p>
        <p v-if="creditMessage" class="studio-help" role="status">{{ creditMessage }}</p>
        <NuxtLink to="/studio/contributors">管理作者資料</NuxtLink>
        <p v-if="contentError || apiError" class="studio-inline-error" role="alert">
          {{ contentError ?? apiError }}
        </p>

        <div class="studio-action-row">
          <button
            class="studio-button studio-button--primary"
            type="submit"
            :disabled="!canEdit || busy"
          >
            {{ busy ? "處理中…" : "儲存 Save" }}
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :aria-expanded="previewVisible"
            aria-controls="studio-private-preview"
            @click="previewVisible = !previewVisible"
          >
            {{ previewVisible ? "關閉私人預覽" : "預覽文章" }}
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canEdit || busy"
            @click="retrySave"
          >
            重試儲存 Retry save
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canSubmit || busy || isDirty"
            :title="isDirty ? '請先儲存目前編輯' : undefined"
            @click="submitForReview"
          >
            送出審核 Submit
          </button>
          <span class="studio-action-result" aria-live="polite">{{ saveMessage }}</span>
        </div>
        <p v-if="!canStudioAction(role, 'edit')" class="studio-inline-error" role="alert">
          {{ missingRoleMessage("edit") }}
        </p>
        <p v-else-if="current.state !== 'DRAFT'" class="studio-help">
          這個 revision 已送出，編輯器會保持唯讀以保護 frozen revision。
        </p>

        <div v-if="conflict" class="studio-conflict" role="alert">
          <strong>衝突 Conflict</strong>
          <p>伺服器 revision 已前進；你的文字尚未被覆蓋。</p>
          <button class="studio-button studio-button--quiet" type="button" @click="keepLocalDraft">
            保留本機草稿 Keep local draft
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="busy"
            @click="reloadDraft"
          >
            重新讀取最新 revision
          </button>
        </div>
        <p v-if="localDraftKept" class="studio-inline-success" role="status">
          本機草稿已保留，下一步是重新讀取並比較 revision。
        </p>
      </form>

      <aside class="studio-panel studio-panel--rail" aria-label="受控生成工具">
        <p class="studio-kicker">Bounded assistance</p>
        <h2>讓建議可追溯</h2>
        <p>生成工具只產生待審核的結構提示；編輯仍要確認原文、權利與 revision。</p>
        <label class="studio-field" for="studio-generative-prompt">
          <span
            >提示詞 Prompt <small>{{ boundedPrompt.length }}/280</small></span
          >
          <textarea
            id="studio-generative-prompt"
            v-model="generativePrompt"
            rows="5"
            maxlength="280"
          />
        </label>
        <button
          class="studio-button studio-button--quiet"
          type="button"
          @click="insertBoundedSuggestion"
        >
          套用受控提示
        </button>
        <dl class="studio-fact-list">
          <div>
            <dt>Revision</dt>
            <dd>{{ current.revisionNumber }}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{{ current.state }}</dd>
          </div>
          <div>
            <dt>Readiness</dt>
            <dd>{{ readinessLabel(current.readiness) }}</dd>
          </div>
        </dl>
      </aside>
    </section>
    <section
      v-if="previewVisible"
      id="studio-private-preview"
      class="studio-panel studio-panel--primary"
      aria-label="私人文章預覽"
    >
      <p class="studio-kicker">私人預覽 · 尚未發布</p>
      <h2>{{ title }}</h2>
      <p>{{ dek }}</p>
      <p v-if="credits.length">
        {{ credits.map((credit) => `${credit.displayName} · ${credit.role}`).join("、") }}
      </p>
      <p v-if="previewMediaMessage" role="status" class="studio-help">{{ previewMediaMessage }}</p>
      <p v-if="preview.error" role="alert" class="studio-inline-error">{{ preview.error }}</p>
      <div v-else-if="preview.document" class="article-body">
        <ContentDocumentRenderer
          :blocks="previewBlocks"
          :article-revision-id="current.revisionId"
          :client-ready="true"
          motion-mode="reduced"
          :interactive-enabled="false"
          :get-asset-url="previewAssetUrl"
          :get-asset-width="previewAssetDimension"
          :get-asset-height="previewAssetDimension"
          :get-asset-attribution="previewAssetAttribution"
          :is-asset-failed="(key) => previewFailures.has(key)"
          :mark-asset-failed="(key) => previewFailures.add(key)"
          :related-article-href="previewRelatedLink"
          :enable-creative="noCreativePlayback"
        />
      </div>
    </section>
  </StudioShell>
</template>
