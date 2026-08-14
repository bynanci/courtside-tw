<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import {
  addManagedTaxonomyAlias,
  createManagedTaxonomyTerm,
  listManagedTaxonomy,
  updateManagedTaxonomyTerm,
  type ManagedTaxonomyTerm,
  type TaxonomyKind,
  type TaxonomyStatus
} from "../studio-api"
import StudioShell from "../StudioShell.vue"
import type { StudioRole } from "../studio-contract"

defineProps<{ role: StudioRole }>()

const kinds: TaxonomyKind[] = ["LEAGUE", "SEASON", "TEAM", "PLAYER", "PERSON", "VENUE", "TOPIC"]
const terms = ref<ManagedTaxonomyTerm[]>([])
const selectedId = ref<string | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const filterKind = ref<TaxonomyKind | "">("")
const filterStatus = ref<TaxonomyStatus | "">("ACTIVE")
const createKey = ref("")
const createName = ref("")
const createKind = ref<TaxonomyKind>("TOPIC")
const createLocale = ref("zh-TW")
const editName = ref("")
const editStatus = ref<TaxonomyStatus>("ACTIVE")
const aliasName = ref("")
const aliasLocale = ref("zh-TW")

const selected = computed(() => terms.value.find((term) => term.id === selectedId.value) ?? null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await listManagedTaxonomy(
      filterKind.value || undefined,
      filterStatus.value || undefined
    )
    terms.value = page.items
    if (selectedId.value && !terms.value.some((term) => term.id === selectedId.value)) {
      selectedId.value = null
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取 taxonomy。"
  } finally {
    loading.value = false
  }
}

function selectTerm(term: ManagedTaxonomyTerm): void {
  selectedId.value = term.id
  editName.value = term.displayName
  editStatus.value = term.status
  aliasName.value = ""
  notice.value = null
}

async function createTerm(): Promise<void> {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const term = await createManagedTaxonomyTerm({
      key: createKey.value.trim(),
      kind: createKind.value,
      displayName: createName.value.trim(),
      locale: createLocale.value.trim()
    })
    createKey.value = ""
    createName.value = ""
    await load()
    const refreshed = terms.value.find((candidate) => candidate.id === term.id) ?? term
    selectTerm(refreshed)
    notice.value = `已建立 ${term.key}；display name 只作為可修改屬性。`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法建立 taxonomy term。"
  } finally {
    busy.value = false
  }
}

async function saveTerm(): Promise<void> {
  if (!selected.value) return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const updated = await updateManagedTaxonomyTerm(selected.value, {
      displayName: editName.value.trim(),
      status: editStatus.value
    })
    terms.value = terms.value.map((term) => (term.id === updated.id ? updated : term))
    selectTerm(updated)
    notice.value = `已儲存 ${updated.key} v${updated.version}。`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法更新 taxonomy term。"
  } finally {
    busy.value = false
  }
}

async function addAlias(): Promise<void> {
  if (!selected.value) return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const updated = await addManagedTaxonomyAlias(
      selected.value,
      aliasName.value.trim(),
      aliasLocale.value.trim()
    )
    terms.value = terms.value.map((term) => (term.id === updated.id ? updated : term))
    selectTerm(updated)
    notice.value = `已加入 alias；normalized value 由服務端產生。`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法新增 alias。"
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <StudioShell
    :role="role"
    active="taxonomy"
    title="Taxonomy management"
    eyebrow="Studio / Discovery"
    description="以 immutable key 與 UUID 管理詞彙；顯示名稱與 aliases 都只是可版本化屬性。"
  >
    <p v-if="error" class="studio-inline-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="studio-help" role="status">{{ notice }}</p>

    <section class="studio-panel studio-panel--primary" aria-labelledby="taxonomy-create-title">
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">Stable identity</p>
          <h2 id="taxonomy-create-title">建立 taxonomy term</h2>
        </div>
      </div>
      <form class="studio-form-grid" @submit.prevent="createTerm">
        <label class="studio-field">
          <span>Immutable key</span>
          <input v-model="createKey" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </label>
        <label class="studio-field">
          <span>Display name</span>
          <input v-model="createName" required maxlength="250" />
        </label>
        <label class="studio-field">
          <span>Kind</span>
          <select v-model="createKind">
            <option v-for="kind in kinds" :key="kind" :value="kind">{{ kind }}</option>
          </select>
        </label>
        <label class="studio-field">
          <span>Locale</span>
          <input v-model="createLocale" required pattern="[a-z]{2,3}(-[A-Z]{2})?" />
        </label>
        <button class="studio-button studio-button--primary" type="submit" :disabled="busy">
          {{ busy ? "儲存中…" : "建立 term" }}
        </button>
      </form>
    </section>

    <section class="studio-panel studio-panel--primary" aria-labelledby="taxonomy-list-title">
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">Managed vocabulary</p>
          <h2 id="taxonomy-list-title">詞彙清單</h2>
        </div>
        <span class="studio-version">{{ terms.length }} terms</span>
      </div>
      <div class="studio-form-grid">
        <label class="studio-field">
          <span>Kind filter</span>
          <select v-model="filterKind" @change="load">
            <option value="">全部</option>
            <option v-for="kind in kinds" :key="kind" :value="kind">{{ kind }}</option>
          </select>
        </label>
        <label class="studio-field">
          <span>Status filter</span>
          <select v-model="filterStatus" @change="load">
            <option value="">全部</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="RETIRED">RETIRED</option>
          </select>
        </label>
      </div>
      <p v-if="loading" class="studio-help" role="status">正在讀取 taxonomy…</p>
      <ul v-else-if="terms.length" class="studio-audit-list">
        <li v-for="term in terms" :key="term.id">
          <span>{{ term.kind }}</span>
          <div>
            <button
              class="studio-button studio-button--quiet"
              type="button"
              @click="selectTerm(term)"
            >
              {{ term.displayName }}
            </button>
            <small>{{ term.key }} · {{ term.status }} · v{{ term.version }}</small>
          </div>
        </li>
      </ul>
      <p v-else class="studio-help">目前沒有符合篩選條件的 terms。</p>
    </section>

    <section
      v-if="selected"
      class="studio-panel studio-panel--primary"
      aria-labelledby="taxonomy-edit-title"
    >
      <div class="studio-panel__heading">
        <div>
          <p class="studio-kicker">{{ selected.id }}</p>
          <h2 id="taxonomy-edit-title">編輯 {{ selected.key }}</h2>
        </div>
        <span class="studio-version">v{{ selected.version }}</span>
      </div>
      <form class="studio-form-grid" @submit.prevent="saveTerm">
        <label class="studio-field">
          <span>Display name</span>
          <input v-model="editName" required maxlength="250" />
        </label>
        <label class="studio-field">
          <span>Status</span>
          <select v-model="editStatus">
            <option value="ACTIVE">ACTIVE</option>
            <option value="RETIRED">RETIRED</option>
          </select>
        </label>
        <button class="studio-button studio-button--primary" type="submit" :disabled="busy">
          儲存屬性
        </button>
      </form>

      <h3>Aliases</h3>
      <ul class="studio-audit-list">
        <li v-for="alias in selected.aliases" :key="alias.id">
          <span>{{ alias.locale }}</span>
          <div>
            <strong>{{ alias.alias }}</strong>
            <small>{{ alias.normalizedAlias }}</small>
          </div>
        </li>
      </ul>
      <form class="studio-form-grid" @submit.prevent="addAlias">
        <label class="studio-field">
          <span>New alias</span>
          <input v-model="aliasName" required maxlength="250" />
        </label>
        <label class="studio-field">
          <span>Alias locale</span>
          <input v-model="aliasLocale" required pattern="[a-z]{2,3}(-[A-Z]{2})?" />
        </label>
        <button class="studio-button studio-button--quiet" type="submit" :disabled="busy">
          新增 alias
        </button>
      </form>
    </section>
  </StudioShell>
</template>
