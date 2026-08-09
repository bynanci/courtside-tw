<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    body: string
    tone?: "empty" | "error"
  }>(),
  { tone: "empty" }
)
</script>

<template>
  <section
    class="reading-state"
    :class="'reading-state--' + tone"
    :aria-live="tone === 'error' ? 'polite' : undefined"
  >
    <p class="eyebrow">{{ tone === "error" ? "暫時無法載入" : "雜誌檔案" }}</p>
    <h2>{{ title }}</h2>
    <p>{{ body }}</p>
  </section>
</template>
