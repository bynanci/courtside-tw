<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"

type PublicRoute = "home" | "issues" | "search" | "library"

const props = withDefaults(
  defineProps<{
    current?: PublicRoute
    contextLabel?: string
    contextTo?: string
    mode?: "global" | "reader"
    tone?: "paper" | "hero"
  }>(),
  {
    current: undefined,
    contextLabel: "← 返回本期目錄",
    contextTo: "/issues",
    mode: "global",
    tone: "paper"
  }
)

const menu = ref<HTMLDetailsElement | null>(null)
const menuPanel = ref<HTMLElement | null>(null)
const menuTrigger = ref<HTMLElement | null>(null)
const enhancementReady = ref(false)
const pageIsolation = new Map<HTMLElement, boolean>()
let desktopMediaQuery: MediaQueryList | null = null

function setPageIsolation(open: boolean): void {
  if (open) {
    const headerWrap = menu.value?.closest(".public-header-wrap")
    const page = menu.value?.closest(".site-page")
    if (!headerWrap || !page) return

    for (const child of page.children) {
      if (!(child instanceof HTMLElement) || child === headerWrap) continue
      if (!pageIsolation.has(child)) pageIsolation.set(child, child.inert)
      child.inert = true
    }

    const header = menu.value?.closest(".site-header")
    if (header) {
      for (const child of header.children) {
        if (!(child instanceof HTMLElement) || child === menu.value) continue
        if (!pageIsolation.has(child)) pageIsolation.set(child, child.inert)
        child.inert = true
      }
    }
    return
  }

  for (const [element, wasInert] of pageIsolation) {
    if (element.isConnected) element.inert = wasInert
  }
  pageIsolation.clear()
}

function closeMenu({ restoreFocus = true } = {}): void {
  if (!menu.value?.open) return
  menu.value.open = false
  if (restoreFocus) void nextTick(() => menuTrigger.value?.focus())
}

function handleMenuToggle(): void {
  const open = menu.value?.open === true
  document.documentElement.toggleAttribute("data-public-menu-open", open)
  setPageIsolation(open)
  if (!open) return
  void nextTick(() => {
    menuPanel.value?.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus()
  })
}

function containMenuFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab" || !menu.value?.open) return
  const focusable = Array.from(
    menuPanel.value?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []
  ).filter((element) => element.getClientRects().length > 0)
  if (focusable.length === 0) return

  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

function closeMenuForDesktop(): void {
  if (!menu.value?.open) return
  const restoreFocus = menu.value.contains(document.activeElement)
  const brand = menu.value.closest(".site-header")?.querySelector<HTMLElement>(".site-brand")
  closeMenu({ restoreFocus: false })
  setPageIsolation(false)
  document.documentElement.removeAttribute("data-public-menu-open")
  if (restoreFocus) void nextTick(() => brand?.focus())
}

function handleDesktopViewport(event: MediaQueryListEvent): void {
  if (event.matches) closeMenuForDesktop()
}

onMounted(() => {
  enhancementReady.value = true
  desktopMediaQuery = window.matchMedia("(min-width: 48.0625rem)")
  desktopMediaQuery.addEventListener("change", handleDesktopViewport)
  if (desktopMediaQuery.matches) closeMenuForDesktop()
  else if (menu.value?.open) handleMenuToggle()
})

onBeforeUnmount(() => {
  desktopMediaQuery?.removeEventListener("change", handleDesktopViewport)
  setPageIsolation(false)
  document.documentElement.removeAttribute("data-public-menu-open")
})
</script>

<template>
  <div
    class="public-header-wrap"
    :class="`public-header-wrap--${props.tone}`"
    data-testid="public-site-header"
  >
    <header class="site-header" :class="{ 'site-header--hero': props.tone === 'hero' }">
      <NuxtLink to="/" class="site-brand" aria-label="Courtside TW 首頁">
        <span>Courtside</span><sup>TW</sup>
      </NuxtLink>

      <nav v-if="props.mode === 'global'" class="public-header__desktop-nav" aria-label="主要導覽">
        <NuxtLink to="/" :aria-current="props.current === 'home' ? 'page' : undefined">
          首頁
        </NuxtLink>
        <NuxtLink to="/issues" :aria-current="props.current === 'issues' ? 'page' : undefined">
          所有期數
        </NuxtLink>
        <NuxtLink to="/search" :aria-current="props.current === 'search' ? 'page' : undefined">
          搜尋
        </NuxtLink>
        <NuxtLink to="/library" :aria-current="props.current === 'library' ? 'page' : undefined">
          我的收藏
        </NuxtLink>
      </nav>

      <nav v-else class="public-header__reader-nav" aria-label="文章導覽">
        <NuxtLink :to="props.contextTo">{{ props.contextLabel }}</NuxtLink>
      </nav>

      <details
        v-if="props.mode === 'global'"
        ref="menu"
        class="public-menu"
        @toggle="handleMenuToggle"
        @keydown.esc.prevent="closeMenu()"
        @keydown="containMenuFocus"
      >
        <summary ref="menuTrigger" class="public-menu__trigger">
          <span class="public-menu__open-label">選單</span>
          <span class="public-menu__close-label">關閉</span>
          <span class="public-menu__mark" aria-hidden="true"></span>
        </summary>
        <div
          ref="menuPanel"
          class="public-menu__panel"
          :role="enhancementReady ? 'dialog' : undefined"
          :aria-modal="enhancementReady ? 'true' : undefined"
          aria-label="主要導覽選單"
        >
          <div class="public-menu__panel-head">
            <span class="public-menu__edition">Basketball for Taiwan</span>
            <button
              v-if="enhancementReady"
              type="button"
              class="public-menu__close"
              @click="closeMenu()"
            >
              關閉選單
            </button>
          </div>
          <nav aria-label="行動版選單">
            <NuxtLink
              to="/"
              :aria-current="props.current === 'home' ? 'page' : undefined"
              @click="closeMenu({ restoreFocus: false })"
            >
              <span aria-hidden="true">01</span>首頁
            </NuxtLink>
            <NuxtLink
              to="/issues"
              :aria-current="props.current === 'issues' ? 'page' : undefined"
              @click="closeMenu({ restoreFocus: false })"
            >
              <span aria-hidden="true">02</span>所有期數
            </NuxtLink>
            <NuxtLink
              to="/search"
              :aria-current="props.current === 'search' ? 'page' : undefined"
              @click="closeMenu({ restoreFocus: false })"
            >
              <span aria-hidden="true">03</span>搜尋
            </NuxtLink>
            <NuxtLink
              to="/library"
              :aria-current="props.current === 'library' ? 'page' : undefined"
              @click="closeMenu({ restoreFocus: false })"
            >
              <span aria-hidden="true">04</span>我的收藏
            </NuxtLink>
          </nav>
          <p>公開閱讀不需要登入或錢包。</p>
        </div>
      </details>
    </header>
  </div>
</template>
