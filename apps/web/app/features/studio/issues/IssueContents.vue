<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import {
  listEditorArticles,
  listIssueArticles,
  replaceIssueArticles,
  type ArticleDraft,
  type IssueDraft,
  type IssueSection,
  type IssueArticleCollection
} from "../studio-api"
import { moveIssueArticle, normalizeIssueArticles } from "./issue-article-order"

const props = defineProps<{ issue: IssueDraft; sections: IssueSection[]; disabled: boolean }>()
const emit = defineEmits<{
  changed: [collection: IssueArticleCollection]
  busy: [value: boolean]
}>()
const articles = ref<IssueArticleCollection["articles"]>([])
const candidates = ref<ArticleDraft[]>([])
const nextCursor = ref<string | null>(null)
const sectionId = ref("")
const articleId = ref("")
const busy = ref(false)
const ready = ref(false)
const error = ref<string | null>(null)
const notice = ref("")
const available = computed(() =>
  candidates.value.filter(
    (candidate) =>
      candidate.state === "PUBLISHED" &&
      !articles.value.some((item) => item.articleId === candidate.articleId)
  )
)

async function loadCandidates(append = false) {
  try {
    const page = await listEditorArticles(100, append ? (nextCursor.value ?? undefined) : undefined)
    candidates.value = append ? [...candidates.value, ...page.items] : page.items
    nextCursor.value = page.page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取已發布文章。"
  }
}
async function load() {
  ready.value = false
  error.value = null
  try {
    const collection = await listIssueArticles(props.issue.issueId)
    if (collection.issueVersion !== props.issue.version)
      throw new Error("期刊版本已變更，請重新讀取整期後再安排文章。")
    articles.value = collection.articles
    ready.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "無法讀取期刊文章。"
  }
}
async function persist(updated: IssueArticleCollection["articles"]) {
  if (busy.value || props.disabled || !ready.value) return
  busy.value = true
  emit("busy", true)
  error.value = null
  notice.value = ""
  try {
    const assignments = normalizeIssueArticles(updated).map(
      ({ articleId, revisionId, sectionId, position }) => {
        if (!revisionId)
          throw new Error("舊目錄含有未綁定版本的文章，請先清除這些項目，再選擇已發布版本。")
        return { articleId, revisionId, sectionId, position }
      }
    )
    const collection = await replaceIssueArticles(
      props.issue.issueId,
      props.issue.version,
      assignments
    )
    articles.value = collection.articles
    emit("changed", collection)
    notice.value = "期刊文章與引用版本已儲存。"
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "儲存失敗；請重新讀取最新期刊版本後確認。"
  } finally {
    busy.value = false
    emit("busy", false)
  }
}
async function add() {
  const article = available.value.find((item) => item.articleId === articleId.value)
  if (!article || !props.sections.some((section) => section.sectionId === sectionId.value)) return
  await persist([
    ...articles.value,
    {
      articleId: article.articleId,
      revisionId: article.revisionId,
      sectionId: sectionId.value,
      position: 1,
      title: article.title,
      slug: article.slug,
      revisionNumber: article.revisionNumber
    }
  ])
}
watch(
  () => props.issue.version,
  () => {
    if (!busy.value) void load()
  }
)
onMounted(async () => {
  await load()
  await loadCandidates()
})
</script>

<template>
  <section aria-label="期刊文章編排">
    <h3>期刊文章與閱讀順序</h3>
    <p class="studio-help">加入已發布文章時會固定引用版本；文章改版不會改寫這一期的內容。</p>
    <fieldset :disabled="disabled || busy || !ready">
      <legend>加入文章</legend>
      <div class="studio-form-grid">
        <label class="studio-field"
          ><span>文章所屬章節</span
          ><select v-model="sectionId">
            <option value="">選擇章節</option>
            <option v-for="section in sections" :key="section.sectionId" :value="section.sectionId">
              {{ section.title }}
            </option>
          </select></label
        >
        <label class="studio-field"
          ><span>已發布文章</span
          ><select v-model="articleId">
            <option value="">選擇文章</option>
            <option
              v-for="article in available"
              :key="article.articleId"
              :value="article.articleId"
            >
              {{ article.title }} · r{{ article.revisionNumber }}
            </option>
          </select></label
        >
        <button
          class="studio-button studio-button--primary"
          type="button"
          :disabled="!sectionId || !articleId"
          @click="add"
        >
          加入期刊文章
        </button>
        <button
          v-if="nextCursor"
          class="studio-button studio-button--quiet"
          type="button"
          @click="loadCandidates(true)"
        >
          載入更多文章
        </button>
        <button
          v-if="articles.some((item) => !item.revisionId)"
          class="studio-button studio-button--quiet"
          type="button"
          @click="persist(articles.filter((item) => item.revisionId))"
        >
          清除未綁定版本的舊文章
        </button>
      </div>
      <div v-for="section in sections" :key="section.sectionId">
        <h4>{{ section.title }}</h4>
        <ol :aria-label="`${section.title}文章`" class="studio-audit-list">
          <li
            v-for="article in articles.filter((item) => item.sectionId === section.sectionId)"
            :key="article.articleId"
          >
            <span>{{ article.position }}</span>
            <div>
              <strong>{{ article.title ?? article.slug }}</strong
              ><small>{{
                article.revisionNumber
                  ? `固定版本 r${article.revisionNumber}`
                  : "需重新指定已發布版本"
              }}</small>
            </div>
            <div class="studio-action-row">
              <button
                class="studio-icon-button"
                type="button"
                :aria-label="`上移文章 ${article.title}`"
                :disabled="article.position === 1"
                @click="persist(moveIssueArticle(articles, article.articleId, -1))"
              >
                ↑
              </button>
              <button
                class="studio-icon-button"
                type="button"
                :aria-label="`下移文章 ${article.title}`"
                :disabled="
                  article.position ===
                  articles.filter((item) => item.sectionId === section.sectionId).length
                "
                @click="persist(moveIssueArticle(articles, article.articleId, 1))"
              >
                ↓
              </button>
              <button
                class="studio-icon-button"
                type="button"
                :aria-label="`移除期刊文章 ${article.title}`"
                @click="persist(articles.filter((item) => item.articleId !== article.articleId))"
              >
                ×
              </button>
            </div>
          </li>
        </ol>
      </div>
    </fieldset>
    <p v-if="error" role="alert" class="studio-inline-error">{{ error }}</p>
    <p v-if="notice" role="status" class="studio-help">{{ notice }}</p>
  </section>
</template>
