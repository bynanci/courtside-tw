<script setup lang="ts">
type PublicRoute = "home" | "issues" | "search" | "library"

const props = defineProps<{
  current?: PublicRoute
}>()
</script>

<template>
  <div class="public-mobile-dock-spacer" aria-hidden="true"></div>
  <nav class="public-mobile-dock" aria-label="行動版主要導覽">
    <NuxtLink to="/" :aria-current="props.current === 'home' ? 'page' : undefined">
      <span aria-hidden="true">01</span>首頁
    </NuxtLink>
    <NuxtLink to="/issues" :aria-current="props.current === 'issues' ? 'page' : undefined">
      <span aria-hidden="true">02</span>期數
    </NuxtLink>
    <NuxtLink to="/search" :aria-current="props.current === 'search' ? 'page' : undefined">
      <span aria-hidden="true">03</span>搜尋
    </NuxtLink>
    <NuxtLink to="/library" :aria-current="props.current === 'library' ? 'page' : undefined">
      <span aria-hidden="true">04</span>收藏
    </NuxtLink>
  </nav>
</template>
