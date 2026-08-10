<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import StudioShell from "../StudioShell.vue"
import { canStudioAction, missingRoleMessage } from "../studio-rbac"
import {
  createEditorIssueSection,
  deleteEditorIssueSection,
  listEditorIssueSections,
  listEditorIssues,
  patchEditorIssue,
  patchEditorIssueSection,
  reorderEditorIssueSections,
  StudioApiError,
  type IssueDraft,
  type IssueSection,
  type IssueSectionCollection
} from "../studio-api"
import type { StudioRole } from "../studio-contract"
import { articleStateLabel } from "../studio-contract"
import { buildIssuePatch, isIssueEditable } from "./issue-editor-contract"
import {
  buildSectionReorder,
  moveSection as moveSectionCopy,
  sectionKeyboardAction
} from "./section-editor-contract"

const props = defineProps<{
  role: StudioRole
  issue: IssueDraft
}>()

const current = ref<IssueDraft>({ ...props.issue })
const title = ref(props.issue.title)
const description = ref(props.issue.description)
const saveMessage = ref("尚未儲存")
const apiError = ref<string | null>(null)
const conflict = ref(false)
const busy = ref(false)
const sections = ref<IssueSection[]>([])
const sectionLoading = ref(true)
const sectionBusy = ref(false)
const sectionError = ref<string | null>(null)
const sectionMessage = ref("尚未載入章節")
const newSectionTitle = ref("")

const canEdit = computed(
  () =>
    canStudioAction(props.role, "edit") &&
    isIssueEditable(current.value.state) &&
    title.value.trim().length > 0 &&
    description.value.trim().length > 0
)

function applyIssue(issue: IssueDraft): void {
  current.value = issue
  title.value = issue.title
  description.value = issue.description
}

function applySectionCollection(collection: IssueSectionCollection): void {
  sections.value = collection.sections
  current.value = { ...current.value, version: collection.issueVersion }
}

async function loadSections(): Promise<void> {
  sectionLoading.value = true
  sectionError.value = null
  try {
    const collection = await listEditorIssueSections(current.value.issueId)
    applySectionCollection(collection)
    sectionMessage.value = `已讀取 ${collection.sections.length} 個章節；issue v${collection.issueVersion}`
  } catch (error) {
    handleSectionError(error)
  } finally {
    sectionLoading.value = false
  }
}

async function saveIssue(): Promise<void> {
  if (!canEdit.value || busy.value) return
  busy.value = true
  apiError.value = null
  conflict.value = false
  try {
    const patch = buildIssuePatch(current.value.issueId, title.value, description.value)
    const updated = await patchEditorIssue(
      current.value.issueId,
      current.value.version,
      patch.changes
    )
    applyIssue(updated)
    saveMessage.value = `期數資料已保存；If-Match 版本 ${updated.version}`
    await loadSections()
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

async function reloadIssue(): Promise<void> {
  if (busy.value || sectionBusy.value) return
  busy.value = true
  apiError.value = null
  conflict.value = false
  try {
    const page = await listEditorIssues()
    const latest = page.items.find((item) => item.issueId === current.value.issueId)
    if (!latest) throw new Error("伺服器找不到這個 issue draft")
    applyIssue(latest)
    saveMessage.value = `已重新讀取 issue v${latest.version}`
    await loadSections()
    sectionMessage.value = `已重新讀取 issue v${latest.version} 的章節`
  } catch (error) {
    handleApiError(error)
  } finally {
    busy.value = false
  }
}

async function persistSections(
  action: () => Promise<IssueSectionCollection>
): Promise<IssueSectionCollection | null> {
  if (!canEdit.value || sectionBusy.value || busy.value) return null
  sectionBusy.value = true
  sectionError.value = null
  conflict.value = false
  try {
    const collection = await action()
    applySectionCollection(collection)
    sectionMessage.value = `章節變更已保存；issue v${collection.issueVersion}`
    return collection
  } catch (error) {
    handleSectionError(error)
    return null
  } finally {
    sectionBusy.value = false
  }
}

async function createSection(): Promise<void> {
  const value = newSectionTitle.value.trim()
  if (!value) {
    sectionError.value = "請輸入章節標題。"
    return
  }
  const result = await persistSections(() =>
    createEditorIssueSection(current.value.issueId, current.value.version, value)
  )
  if (result) newSectionTitle.value = ""
}

async function moveSection(index: number, delta: -1 | 1): Promise<void> {
  const reordered = moveSectionCopy(sections.value, index, delta)
  if (
    reordered.every(
      (section, position) => section.sectionId === sections.value[position]?.sectionId
    )
  ) {
    return
  }
  await persistSections(() =>
    reorderEditorIssueSections(
      current.value.issueId,
      current.value.version,
      buildSectionReorder(reordered)
    )
  )
}

function onSectionKeydown(event: KeyboardEvent, index: number): void {
  const action = sectionKeyboardAction(event.key)
  if (action === 0) return
  event.preventDefault()
  void moveSection(index, action)
}

async function renameSection(section: IssueSection, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const value = input.value.trim()
  if (!value || value === section.title) {
    input.value = section.title
    return
  }
  const result = await persistSections(() =>
    patchEditorIssueSection(current.value.issueId, section.sectionId, current.value.version, value)
  )
  if (!result) input.value = section.title
}

async function deleteSection(section: IssueSection): Promise<void> {
  if (section.articleCount > 0) {
    sectionError.value = "含有文章的章節不可刪除；請先移出文章。"
    return
  }
  await persistSections(() =>
    deleteEditorIssueSection(current.value.issueId, section.sectionId, current.value.version)
  )
}

function handleApiError(error: unknown): void {
  if (error instanceof StudioApiError && error.status === 409) {
    conflict.value = true
    saveMessage.value = "409 VERSION_CONFLICT：伺服器已有較新的 issue 版本"
    apiError.value = error.message
    return
  }
  apiError.value = error instanceof Error ? error.message : "Issue API 請求失敗。"
  saveMessage.value = apiError.value
}

function handleSectionError(error: unknown): void {
  if (error instanceof StudioApiError && error.status === 409) {
    conflict.value = true
    sectionMessage.value = "409 VERSION_CONFLICT：請重新讀取後再排序。"
    sectionError.value = error.message
    return
  }
  sectionError.value = error instanceof Error ? error.message : "Section API 請求失敗。"
  sectionMessage.value = sectionError.value
}

onMounted(() => {
  void loadSections()
})
</script>

<template>
  <StudioShell
    :role="role"
    active="issues"
    audit-target-type="ISSUE"
    :audit-target-id="current.issueId"
    title="期數編輯 Issue editor"
    eyebrow="Studio / Issue"
    description="期數與目錄直接讀寫 editorial API；排序、改名與版本衝突都留在伺服器可驗證邊界。"
  >
    <template #header-actions>
      <div class="studio-header-status" aria-label="期數狀態">
        <span class="studio-status-dot studio-status-dot--draft" aria-hidden="true" />
        {{ articleStateLabel(current.state) }} · v{{ current.version }}
      </div>
    </template>

    <section class="studio-grid studio-grid--issue" aria-label="期數編輯工作區">
      <form class="studio-panel studio-panel--primary" @submit.prevent="saveIssue">
        <div class="studio-panel__heading">
          <div>
            <p class="studio-kicker">Issue {{ current.issueNumber }} · {{ current.issueId }}</p>
            <h2>期數 metadata</h2>
          </div>
          <span class="studio-version">If-Match v{{ current.version }}</span>
        </div>

        <div class="studio-form-grid">
          <label class="studio-field studio-field--wide" for="studio-issue-title">
            <span>期數標題 Title</span>
            <input
              id="studio-issue-title"
              v-model="title"
              maxlength="250"
              required
              :disabled="!canEdit || busy"
            />
          </label>
          <label class="studio-field studio-field--wide" for="studio-issue-description">
            <span>期數說明 Description</span>
            <textarea
              id="studio-issue-description"
              v-model="description"
              rows="3"
              maxlength="1000"
              required
              :disabled="!canEdit || busy"
            />
          </label>
          <label class="studio-field" for="studio-issue-slug">
            <span>Slug（由 API 管理）</span>
            <input id="studio-issue-slug" :value="current.slug" readonly />
          </label>
          <label class="studio-field" for="studio-issue-cover-asset">
            <span>Cover asset（由 rights gate 管理）</span>
            <input id="studio-issue-cover-asset" :value="current.coverAssetId" readonly />
          </label>
        </div>

        <p v-if="apiError" class="studio-inline-error" role="alert">{{ apiError }}</p>
        <div v-if="conflict" class="studio-conflict" role="alert">
          <strong>版本衝突 Conflict</strong>
          <p>伺服器已有較新的 issue 版本；本機欄位尚未被覆蓋。</p>
          <button class="studio-button studio-button--quiet" type="button" @click="reloadIssue">
            重新讀取最新版本
          </button>
        </div>

        <div class="studio-action-row">
          <button
            class="studio-button studio-button--primary"
            type="submit"
            :disabled="!canEdit || busy"
          >
            {{ busy ? "保存中…" : "保存期數 Save" }}
          </button>
          <button
            class="studio-button studio-button--quiet"
            type="button"
            :disabled="busy || sectionBusy"
            @click="reloadIssue"
          >
            重新讀取 Reload
          </button>
          <span class="studio-action-result" role="status" aria-live="polite">{{
            saveMessage
          }}</span>
        </div>
        <p v-if="!canStudioAction(role, 'edit')" class="studio-inline-error" role="alert">
          {{ missingRoleMessage("edit") }}
        </p>
        <p v-else-if="!isIssueEditable(current.state)" class="studio-help">
          這個 issue 已離開 draft；編輯器保持唯讀以保護已進入 workflow 的資料。
        </p>

        <div class="studio-section-list" aria-labelledby="studio-section-heading">
          <div class="studio-section-list__heading">
            <div>
              <h3 id="studio-section-heading">閱讀順序與章節</h3>
              <span>伺服器持久化 · Arrow Up / Arrow Down 可排序</span>
            </div>
            <span>{{ sections.length }} sections</span>
          </div>

          <div class="studio-action-row studio-section-create">
            <label class="studio-field" for="studio-new-section-title">
              <span>新增章節</span>
              <input
                id="studio-new-section-title"
                v-model="newSectionTitle"
                maxlength="250"
                placeholder="例如：場邊現場"
                :disabled="!canEdit || sectionBusy"
              />
            </label>
            <button
              class="studio-button studio-button--primary"
              type="button"
              :disabled="!canEdit || sectionBusy"
              @click="createSection"
            >
              新增章節
            </button>
          </div>

          <p v-if="sectionLoading" class="studio-help" role="status">正在讀取章節 API…</p>
          <p v-else-if="sectionError" class="studio-inline-error" role="alert">
            {{ sectionError }}
          </p>
          <p v-else-if="!sections.length" class="studio-help">
            尚未建立章節；新增後即可安排閱讀順序。
          </p>
          <ol v-else aria-label="可排序的期數章節">
            <li
              v-for="(section, index) in sections"
              :key="section.sectionId"
              class="studio-section-row"
              :tabindex="canEdit ? 0 : -1"
              @keydown="onSectionKeydown($event, index)"
            >
              <span class="studio-section-row__number" aria-hidden="true">{{
                String(section.position).padStart(2, "0")
              }}</span>
              <label
                class="studio-section-row__editor"
                :for="'studio-section-' + section.sectionId"
              >
                <span class="sr-only">第 {{ section.position }} 章節標題</span>
                <input
                  :id="'studio-section-' + section.sectionId"
                  :value="section.title"
                  maxlength="250"
                  :disabled="!canEdit || sectionBusy"
                  @change="renameSection(section, $event)"
                />
                <span>{{ section.articleCount }} 篇文章 · section v{{ section.version }}</span>
              </label>
              <div class="studio-section-row__controls" aria-label="章節排序與管理">
                <button
                  class="studio-icon-button"
                  type="button"
                  :disabled="!canEdit || sectionBusy || index === 0"
                  :aria-label="'上移 ' + section.title"
                  @click="moveSection(index, -1)"
                >
                  ↑
                </button>
                <button
                  class="studio-icon-button"
                  type="button"
                  :disabled="!canEdit || sectionBusy || index === sections.length - 1"
                  :aria-label="'下移 ' + section.title"
                  @click="moveSection(index, 1)"
                >
                  ↓
                </button>
                <button
                  class="studio-icon-button studio-icon-button--danger"
                  type="button"
                  :disabled="!canEdit || sectionBusy || section.articleCount > 0"
                  :aria-label="'刪除 ' + section.title"
                  @click="deleteSection(section)"
                >
                  ×
                </button>
              </div>
            </li>
          </ol>
          <p class="studio-action-result" role="status" aria-live="polite">{{ sectionMessage }}</p>
        </div>
      </form>

      <aside class="studio-panel studio-panel--rail">
        <p class="studio-kicker">Server-backed issue state</p>
        <h2>目錄就是出版順序</h2>
        <p>
          每個 section 的標題、文章數與 position 都由 API 回傳；排序會以 issue aggregate version 做
          If-Match，避免兩個編輯器互相覆寫。
        </p>
        <ul class="studio-check-list">
          <li>新增、改名、刪除與排序都會持久化</li>
          <li>Arrow Up / Arrow Down 與上移／下移按鈕共用同一條 API</li>
          <li>含文章的 section 由伺服器與介面共同禁止刪除</li>
        </ul>
        <dl class="studio-fact-list">
          <div>
            <dt>State</dt>
            <dd>{{ current.state }}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{{ current.version }}</dd>
          </div>
          <div>
            <dt>Audit target</dt>
            <dd>ISSUE / {{ current.issueId }}</dd>
          </div>
        </dl>
      </aside>
    </section>
  </StudioShell>
</template>
