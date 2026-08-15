<script setup lang="ts">
import { onMounted, ref } from "vue"

import {
  deleteBookmark,
  listBookmarks,
  putBookmark,
  readReaderSession,
  ReaderLibraryApiError
} from "../../library/reader-library-api"

const props = defineProps<{ articleId: string }>()

const signedIn = ref(false)
const bookmarked = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const session = await readReaderSession()
    signedIn.value = session.canSync
    if (!session.canSync) return
    const page = await listBookmarks()
    bookmarked.value = page.items.some((item) => item.articleId === props.articleId)
  } catch (cause) {
    if (cause instanceof ReaderLibraryApiError && cause.status === 401) {
      signedIn.value = false
      return
    }
    error.value = "書籤狀態暫時無法同步；文章仍可正常閱讀。"
  }
})

async function toggleBookmark(): Promise<void> {
  if (!signedIn.value || pending.value) return
  pending.value = true
  error.value = null
  const next = !bookmarked.value
  try {
    if (next) await putBookmark(props.articleId)
    else await deleteBookmark(props.articleId)
    bookmarked.value = next
  } catch (cause) {
    if (cause instanceof ReaderLibraryApiError && cause.status === 401) signedIn.value = false
    error.value = "書籤同步失敗，請重新登入後再試。"
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div v-if="signedIn" class="reader-library-control">
    <button
      type="button"
      class="button-link button-link--quiet"
      data-testid="bookmark-toggle"
      :aria-pressed="bookmarked"
      :disabled="pending"
      @click="toggleBookmark"
    >
      {{ bookmarked ? "已加入書籤" : "加入書籤" }}
    </button>
    <p v-if="error" class="reader-library-control__error" role="status">{{ error }}</p>
  </div>
</template>

<style scoped>
.reader-library-control {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}

.reader-library-control .button-link {
  min-height: 44px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.reader-library-control__error {
  max-width: 28rem;
  margin: 0;
  color: var(--accent);
  font-size: 0.75rem;
}
</style>
