<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import StudioShell from "../StudioShell.vue"
import type { StudioRole } from "../studio-contract"
import {
  archiveContributor,
  createContributor,
  listContributors,
  updateContributor,
  StudioApiError,
  type ManagedContributor
} from "../studio-api"

const props = defineProps<{ role: StudioRole }>()
const items = ref<ManagedContributor[]>([])
const selectedId = ref<string | null>(null)
const selected = computed(
  () => items.value.find((item) => item.contributorId === selectedId.value) ?? null
)
const status = ref<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE")
const slug = ref("")
const name = ref("")
const editName = ref("")
const reason = ref("")
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

async function load() {
  try {
    items.value = (await listContributors(status.value)).items
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取作者。"
  }
}

function select(item: ManagedContributor) {
  selectedId.value = item.contributorId
  editName.value = item.displayName
  reason.value = ""
}

async function mutate(action: () => Promise<ManagedContributor>, message: string) {
  if (busy.value || props.role !== "EDITOR") return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const result = await action()
    await load()
    selectedId.value = items.value.some((item) => item.contributorId === result.contributorId)
      ? result.contributorId
      : null
    editName.value = result.displayName
    notice.value = message
  } catch (cause) {
    error.value =
      cause instanceof StudioApiError && cause.status === 409
        ? `${cause.message} 若版本已更新，請重新讀取後比較；已用於文章署名的姓名會保留，不可直接改名。`
        : cause instanceof Error
          ? cause.message
          : "作者變更失敗。"
  } finally {
    busy.value = false
  }
}

async function create() {
  await mutate(
    () => createContributor({ slug: slug.value.trim(), displayName: name.value.trim() }),
    "作者已建立。"
  )
  if (!error.value) {
    slug.value = ""
    name.value = ""
  }
}
async function save() {
  const item = selected.value
  if (item) await mutate(() => updateContributor(item, editName.value.trim()), "公開署名已更新。")
}
async function archive() {
  const item = selected.value
  if (item && reason.value.trim())
    await mutate(
      () => archiveContributor(item, reason.value.trim()),
      "作者已封存；既有文章署名繼續保留。"
    )
}
onMounted(load)
</script>

<template>
  <StudioShell
    :role="role"
    active="contributors"
    title="作者與署名"
    eyebrow="Studio / Contributors"
    description="管理公開姓名與署名身分；文章內的署名順序由文章編輯器安排。"
  >
    <p v-if="error" class="studio-inline-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="studio-help" role="status">{{ notice }}</p>
    <section class="studio-panel studio-panel--primary" aria-label="建立作者">
      <h2>建立作者</h2>
      <form class="studio-form-grid" @submit.prevent="create">
        <label class="studio-field"
          ><span>作者網址代稱</span
          ><input
            v-model="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxlength="128"
            :disabled="busy"
        /></label>
        <label class="studio-field"
          ><span>作者公開姓名</span><input v-model="name" required maxlength="200" :disabled="busy"
        /></label>
        <button class="studio-button studio-button--primary" type="submit" :disabled="busy">
          建立作者
        </button>
      </form>
    </section>
    <section class="studio-panel studio-panel--primary" aria-label="作者清單">
      <div class="studio-panel__heading">
        <h2>作者清單</h2>
        <button
          class="studio-button studio-button--quiet"
          type="button"
          :disabled="busy"
          @click="load"
        >
          重新讀取作者
        </button>
      </div>
      <label class="studio-field"
        ><span>作者狀態</span
        ><select v-model="status" :disabled="busy" @change="load">
          <option value="ACTIVE">使用中</option>
          <option value="ARCHIVED">已封存</option>
          <option value="ALL">全部</option>
        </select></label
      >
      <ul class="studio-audit-list">
        <li v-for="item in items" :key="item.contributorId">
          <span>{{ item.status === "ACTIVE" ? "使用中" : "已封存" }}</span>
          <div>
            <button
              class="studio-button studio-button--quiet"
              type="button"
              :disabled="busy"
              @click="select(item)"
            >
              {{ item.displayName }}</button
            ><small>{{ item.slug }} · v{{ item.version }}</small>
          </div>
        </li>
      </ul>
      <p v-if="!items.length" class="studio-help">目前沒有符合條件的作者。</p>
    </section>
    <section v-if="selected" class="studio-panel studio-panel--primary" aria-label="編輯作者">
      <h2>編輯作者</h2>
      <p class="studio-help">
        網址代稱固定為 {{ selected.slug }}。姓名一旦用於文章署名就會保留，封存後也不會移除既有署名。
      </p>
      <form class="studio-form-grid" @submit.prevent="save">
        <label class="studio-field"
          ><span>編輯公開姓名</span
          ><input
            v-model="editName"
            required
            maxlength="200"
            :disabled="busy || selected.status === 'ARCHIVED'"
        /></label>
        <button
          class="studio-button studio-button--primary"
          type="submit"
          :disabled="busy || selected.status === 'ARCHIVED'"
        >
          儲存姓名
        </button>
      </form>
      <aside aria-label="署名預覽">
        <h3>署名預覽</h3>
        <p>{{ editName }}</p>
        <small>{{ selected.slug }}</small>
      </aside>
      <form v-if="selected.status === 'ACTIVE'" class="studio-form-grid" @submit.prevent="archive">
        <label class="studio-field"
          ><span>作者封存原因</span
          ><textarea v-model="reason" required maxlength="1000" :disabled="busy" />
        </label>
        <button
          class="studio-button studio-button--quiet"
          type="submit"
          :disabled="busy || !reason.trim()"
        >
          確認封存作者
        </button>
      </form>
    </section>
  </StudioShell>
</template>
