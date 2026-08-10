<script setup lang="ts">
import { computed, ref } from "vue"

import StudioShell from "../StudioShell.vue"
import {
  getMediaMetadata,
  StudioApiError,
  updateMediaMetadata,
  type MediaMetadata
} from "../studio-api"
import type { StudioMediaState, StudioRole } from "../studio-contract"
import { mediaStateLabel } from "../studio-contract"
import {
  canSubmitMedia,
  type AllowedMediaChannel,
  MAX_UPLOAD_BYTES,
  validateMediaMetadata,
  validateMediaUpload
} from "./upload-contract"
import {
  buildMediaMetadataUpdate,
  canPersistMediaMetadata,
  canStartMediaUpload
} from "./media-library-contract"
import { completeUpload, putPrivateOriginal, requestUploadIntent, sha256Hex } from "./media-api"

const props = defineProps<{ role: StudioRole }>()

const file = ref<File | null>(null)
const state = ref<StudioMediaState>("PENDING")
const assetId = ref<string | null>(null)
const metadataVersion = ref<number | null>(null)
const rightsVersion = ref<number | null>(null)
const checksum = ref("")
const altText = ref("")
const credit = ref("")
const rightsOwner = ref("")
const licenseName = ref("")
const allowedChannel = ref<AllowedMediaChannel>("PUBLIC_WEB")
const territoriesText = ref("GLOBAL")
const validFrom = ref(defaultRightsStart())
const validUntil = ref(defaultRightsEnd())
const withdrawalTerms = ref("Contact the Courtside rights desk before withdrawal.")
const rightsStatus = ref<"UNKNOWN" | "PENDING" | "VALID" | "EXPIRED" | "REVOKED" | "BLOCKED">(
  "PENDING"
)
const feedback = ref("")
const busy = ref(false)
const metadataBusy = ref(false)

const uploadDraft = computed(() => ({
  filename: file.value?.name ?? "",
  contentType: file.value?.type ?? "",
  sizeBytes: file.value?.size ?? 0,
  checksumSha256: checksum.value,
  altText: altText.value,
  credit: credit.value,
  rightsStatus: rightsStatus.value === "BLOCKED" ? "REVOKED" : rightsStatus.value
}))
const uploadValidationErrors = computed(() => validateMediaUpload(uploadDraft.value))
const metadataDraft = computed(() => ({
  altText: altText.value,
  rightsOwner: rightsOwner.value,
  licenseName: licenseName.value,
  allowedChannels: [allowedChannel.value],
  territories: territoriesText.value
    .split(",")
    .map((territory) => territory.trim())
    .filter(Boolean),
  validFrom: toInstant(validFrom.value),
  validUntil: toInstant(validUntil.value),
  credit: credit.value,
  withdrawalTerms: withdrawalTerms.value,
  rightsStatus: rightsStatus.value
}))
const metadataValidationErrors = computed(() => validateMediaMetadata(metadataDraft.value))
const canUpload = computed(() =>
  canStartMediaUpload(
    props.role,
    Boolean(file.value),
    busy.value,
    state.value,
    uploadValidationErrors.value
  )
)
const canSaveMetadata = computed(() =>
  canPersistMediaMetadata(
    props.role,
    assetId.value,
    metadataVersion.value,
    busy.value,
    metadataBusy.value,
    metadataValidationErrors.value
  )
)
const canSubmit = computed(() =>
  canSubmitMedia(state.value, uploadDraft.value, uploadValidationErrors.value)
)

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  assetId.value = null
  metadataVersion.value = null
  rightsVersion.value = null
  state.value = "PENDING"
  checksum.value = ""
  feedback.value = ""
  if (file.value) {
    try {
      checksum.value = await sha256Hex(file.value)
    } catch {
      feedback.value = "無法計算 checksum，請重新選取檔案。"
    }
  }
}

async function upload(): Promise<void> {
  if (!canUpload.value || !file.value) return
  busy.value = true
  state.value = "PROCESSING"
  feedback.value = "正在建立短效 upload intent…"
  let uploadCompleted = false
  try {
    const key = `studio-media-${crypto.randomUUID()}`
    const intent = await requestUploadIntent(
      {
        filename: file.value.name,
        contentType: file.value.type as "image/avif" | "image/jpeg" | "image/png" | "image/webp",
        sizeBytes: file.value.size,
        checksumSha256: checksum.value
      },
      key
    )
    assetId.value = intent.assetId
    await putPrivateOriginal(intent, file.value, file.value.type)
    const result = await completeUpload(
      intent.assetId,
      checksum.value,
      file.value.type,
      `${key}-complete`
    )
    uploadCompleted = true
    state.value = result.state ?? "PROCESSING"
    metadataVersion.value = result.version
    await loadMetadata(intent.assetId)
    feedback.value = "原始檔已進 private storage；請保存 metadata 以完成 API 持久化。"
  } catch (error) {
    if (!uploadCompleted) state.value = "FAILED"
    feedback.value = uploadCompleted
      ? error instanceof Error
        ? `上傳已完成，但 metadata 讀取失敗：${error.message}`
        : "上傳已完成，但 metadata 讀取失敗。"
      : error instanceof Error
        ? error.message
        : "上傳失敗。"
  } finally {
    busy.value = false
  }
}

async function loadMetadata(id: string): Promise<void> {
  const metadata = await getMediaMetadata(id)
  syncMetadata(metadata)
}

async function saveMetadata(): Promise<void> {
  if (!canSaveMetadata.value || !assetId.value || metadataVersion.value === null) return
  metadataBusy.value = true
  feedback.value = "正在保存 alt text、credit 與 rights metadata…"
  try {
    const updated = await updateMediaMetadata(
      assetId.value,
      metadataVersion.value,
      buildMediaMetadataUpdate(metadataDraft.value, rightsVersion.value)
    )
    syncMetadata(updated)
    feedback.value = `metadata 已保存；asset version ${updated.version}。`
  } catch (error) {
    if (error instanceof StudioApiError && error.status === 409 && assetId.value) {
      try {
        await loadMetadata(assetId.value)
        feedback.value = "metadata 已被其他人更新；已重新載入最新版本，請確認後再保存。"
      } catch {
        feedback.value = "metadata 版本衝突，且最新資料讀取失敗。"
      }
    } else {
      feedback.value = error instanceof Error ? error.message : "metadata 保存失敗。"
    }
  } finally {
    metadataBusy.value = false
  }
}

async function markRightsValid(): Promise<void> {
  if (!assetId.value) {
    feedback.value = "請先完成 upload，之後才能把 rights decision 寫入 API。"
    return
  }
  rightsStatus.value = "VALID"
  await saveMetadata()
}

function syncMetadata(metadata: MediaMetadata): void {
  metadataVersion.value = metadata.version
  altText.value = metadata.altText ?? ""
  state.value = metadata.state
  if (!metadata.rights) {
    rightsVersion.value = null
    return
  }
  rightsVersion.value = metadata.rights.version ?? null
  rightsOwner.value = metadata.rights.rightsOwner
  licenseName.value = metadata.rights.licenseName
  allowedChannel.value = metadata.rights.allowedChannels[0] ?? "PUBLIC_WEB"
  territoriesText.value = metadata.rights.territories.join(", ")
  validFrom.value = toLocalInput(metadata.rights.validFrom)
  validUntil.value = toLocalInput(metadata.rights.validUntil)
  credit.value = metadata.rights.credit
  withdrawalTerms.value = metadata.rights.withdrawalTerms
  rightsStatus.value = metadata.rights.status
}

function toInstant(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function toLocalInput(value: string | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultRightsStart(): string {
  return toLocalInput(new Date())
}

function defaultRightsEnd(): string {
  const end = new Date()
  end.setFullYear(end.getFullYear() + 1)
  return toLocalInput(end)
}
</script>

<template>
  <StudioShell
    :role="role"
    active="media"
    audit-target-type="MEDIA_ASSET"
    :audit-target-id="assetId ?? undefined"
    title="媒體庫 Media library"
    eyebrow="Studio / Media"
    description="原始檔留在 private storage；alt text、credit 與 rights metadata 透過 editor API 持久化，才進入發布檢查。"
  >
    <section class="studio-grid studio-grid--media" aria-label="媒體上傳工作區">
      <form class="studio-panel studio-panel--primary" @submit.prevent="upload">
        <div class="studio-panel__heading">
          <div>
            <p class="studio-kicker">T048 upload</p>
            <h2>新增一張可追溯的圖片</h2>
          </div>
          <span class="studio-state-chip" :data-state="state">{{ mediaStateLabel(state) }}</span>
        </div>

        <label class="studio-upload-drop" for="studio-media-file">
          <input
            id="studio-media-file"
            type="file"
            accept="image/avif,image/jpeg,image/png,image/webp"
            @change="onFileChange"
          />
          <strong>{{ file ? file.name : "選擇圖片" }}</strong>
          <span>AVIF / JPEG / PNG / WebP · 上限 {{ MAX_UPLOAD_BYTES / 1024 / 1024 }} MiB</span>
        </label>

        <div class="studio-form-grid">
          <label class="studio-field studio-field--wide" for="studio-media-alt">
            <span>替代文字 Alt text</span>
            <textarea id="studio-media-alt" v-model="altText" rows="3" maxlength="1000" />
          </label>
          <label class="studio-field" for="studio-media-rights-owner">
            <span>Rights owner</span>
            <input id="studio-media-rights-owner" v-model="rightsOwner" maxlength="512" />
          </label>
          <label class="studio-field" for="studio-media-license">
            <span>License</span>
            <input id="studio-media-license" v-model="licenseName" maxlength="512" />
          </label>
          <label class="studio-field" for="studio-media-credit">
            <span>Credit</span>
            <input id="studio-media-credit" v-model="credit" maxlength="1000" />
          </label>
          <label class="studio-field" for="studio-media-rights">
            <span>Rights status</span>
            <select id="studio-media-rights" v-model="rightsStatus">
              <option value="PENDING">待補文件</option>
              <option value="VALID">有效</option>
              <option value="EXPIRED">已過期</option>
              <option value="REVOKED">已撤回</option>
              <option value="BLOCKED">阻擋</option>
              <option value="UNKNOWN">尚未確認</option>
            </select>
          </label>
          <label class="studio-field" for="studio-media-channel">
            <span>Allowed channel</span>
            <select id="studio-media-channel" v-model="allowedChannel">
              <option value="PUBLIC_WEB">PUBLIC_WEB</option>
              <option value="READER_LIBRARY">READER_LIBRARY</option>
              <option value="OFFLINE">OFFLINE</option>
              <option value="PROVENANCE">PROVENANCE</option>
            </select>
          </label>
          <label class="studio-field" for="studio-media-territories">
            <span>Territories</span>
            <input
              id="studio-media-territories"
              v-model="territoriesText"
              placeholder="GLOBAL, TW"
            />
          </label>
          <label class="studio-field" for="studio-media-valid-from">
            <span>Valid from</span>
            <input id="studio-media-valid-from" v-model="validFrom" type="datetime-local" />
          </label>
          <label class="studio-field" for="studio-media-valid-until">
            <span>Valid until</span>
            <input id="studio-media-valid-until" v-model="validUntil" type="datetime-local" />
          </label>
          <label class="studio-field studio-field--wide" for="studio-media-withdrawal">
            <span>Withdrawal terms</span>
            <textarea
              id="studio-media-withdrawal"
              v-model="withdrawalTerms"
              rows="2"
              maxlength="2000"
            />
          </label>
        </div>

        <ul
          v-if="file && uploadValidationErrors.length"
          class="studio-error-list"
          aria-label="媒體欄位錯誤"
        >
          <li v-for="error in uploadValidationErrors" :key="error">{{ error }}</li>
        </ul>
        <ul
          v-if="assetId && metadataValidationErrors.length"
          class="studio-error-list"
          aria-label="權利欄位錯誤"
        >
          <li v-for="error in metadataValidationErrors" :key="error">{{ error }}</li>
        </ul>
        <dl class="studio-fact-list studio-fact-list--horizontal">
          <div>
            <dt>Checksum</dt>
            <dd>{{ checksum ? `${checksum.slice(0, 12)}…` : "—" }}</dd>
          </div>
          <div>
            <dt>Asset</dt>
            <dd>{{ assetId ?? "尚未建立" }}</dd>
          </div>
          <div>
            <dt>API version</dt>
            <dd>{{ metadataVersion ?? "—" }}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{{ state }}</dd>
          </div>
        </dl>

        <div class="studio-action-row">
          <button class="studio-button studio-button--primary" type="submit" :disabled="!canUpload">
            {{ busy ? "處理中…" : "建立 upload intent" }}
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="!canSaveMetadata"
            @click="saveMetadata"
          >
            {{ metadataBusy ? "保存中…" : "保存 metadata" }}
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="rightsStatus === 'VALID' || metadataBusy"
            @click="markRightsValid"
          >
            標記權利已確認
          </button>
        </div>
        <p v-if="feedback" class="studio-action-result" role="status">{{ feedback }}</p>
        <p v-if="!canSubmit" class="studio-help">
          可發布前置條件：processing 完成、alt text、credit 與有效 rights
          record；這些欄位必須先保存到 API。
        </p>
      </form>

      <aside class="studio-panel studio-panel--rail">
        <p class="studio-kicker">Private original / public variant</p>
        <h2>權利是發布閘門</h2>
        <p>
          上傳成功不等於可發布。metadata 保存使用 asset version，過期版本會回傳 409 而不覆蓋新資料。
        </p>
        <ol class="studio-timeline">
          <li class="is-current">
            <span>01</span><strong>Intent</strong><small>短效、限 MIME、限大小</small>
          </li>
          <li>
            <span>02</span><strong>Process</strong><small>checksum / magic bytes / variants</small>
          </li>
          <li>
            <span>03</span><strong>Rights</strong><small>owner / credit / channel / expiry</small>
          </li>
          <li><span>04</span><strong>Publish</strong><small>publisher-only decision</small></li>
        </ol>
      </aside>
    </section>
  </StudioShell>
</template>
