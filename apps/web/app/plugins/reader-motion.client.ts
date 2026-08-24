import { defineNuxtPlugin, useState } from "#app"
import type { RouterScrollBehavior } from "vue-router"

import {
  resolveReaderMotionPolicy,
  staticReaderMotionPolicy,
  type ReaderMotionFlags,
  type ReaderMotionPolicy
} from "../features/motion/reader-motion-policy"
import { readerMotionNavigationSettledEvent } from "../features/motion/shared-issue-cover"

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean
    addEventListener?: (type: "change", listener: () => void) => void
    removeEventListener?: (type: "change", listener: () => void) => void
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const configured = config.public.creative.motion
  const flags: ReaderMotionFlags = {
    enabled: configured.enabled,
    route: configured.patterns.route,
    issueCover: configured.patterns.issueCover,
    tocReveal: configured.patterns.tocReveal,
    readingProgress: configured.patterns.readingProgress,
    feedback: configured.patterns.feedback
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const forcedColors = window.matchMedia("(forced-colors: active)")
  const connection = (navigator as NavigatorWithConnection).connection
  const policyState = useState<ReaderMotionPolicy>("reader-motion-policy", () => ({
    ...staticReaderMotionPolicy,
    patterns: { ...staticReaderMotionPolicy.patterns }
  }))
  let settledFrame: number | null = null
  let restoreScrollBehavior: (() => void) | null = null
  let disposed = false

  const installScrollSettlementObserver = (): void => {
    if (disposed || restoreScrollBehavior) return
    const router = nuxtApp.$router
    const originalScrollBehavior = router.options.scrollBehavior
    if (!originalScrollBehavior) return

    const wrappedScrollBehavior: RouterScrollBehavior = async (to, from, savedPosition) => {
      const position = await originalScrollBehavior(to, from, savedPosition)
      if (disposed) return position
      if (settledFrame !== null) window.cancelAnimationFrame(settledFrame)
      settledFrame = window.requestAnimationFrame(() => {
        settledFrame = null
        window.dispatchEvent(new Event(readerMotionNavigationSettledEvent))
      })
      return position
    }

    router.options.scrollBehavior = wrappedScrollBehavior
    restoreScrollBehavior = () => {
      if (router.options.scrollBehavior === wrappedScrollBehavior) {
        router.options.scrollBehavior = originalScrollBehavior
      }
    }
  }

  const removeAppCreatedHook = nuxtApp.hook("app:created", installScrollSettlementObserver)
  const removeAppMountedHook = nuxtApp.hook("app:mounted", installScrollSettlementObserver)

  const finishCoverAnimations = (): void => {
    for (const cover of document.querySelectorAll<HTMLElement>(
      '[data-motion-pattern="issue-cover-carry"]'
    )) {
      for (const animation of cover.getAnimations()) {
        try {
          animation.finish()
        } catch {
          // A replaced animation can become unfinishable; cancellation still restores final DOM.
        } finally {
          animation.cancel()
        }
      }
    }
  }

  const applyPolicy = (): void => {
    const policy = resolveReaderMotionPolicy({
      flags,
      prefersReducedMotion: reducedMotion.matches,
      saveData: connection?.saveData === true,
      forcedColors: forcedColors.matches
    })
    const root = document.documentElement
    root.dataset.readerMotion = policy.mode
    root.dataset.readerMotionRoute = policy.patterns.route ? "enabled" : "disabled"
    root.dataset.readerMotionCover = policy.patterns.issueCover ? "enabled" : "disabled"
    root.dataset.readerMotionToc = policy.patterns.tocReveal ? "enabled" : "disabled"
    root.dataset.readerMotionProgress = policy.patterns.readingProgress ? "enabled" : "disabled"
    root.dataset.readerMotionFeedback = policy.patterns.feedback ? "enabled" : "disabled"
    policyState.value = policy
    if (policy.mode !== "full") finishCoverAnimations()
  }

  applyPolicy()
  reducedMotion.addEventListener("change", applyPolicy)
  forcedColors.addEventListener("change", applyPolicy)
  connection?.addEventListener?.("change", applyPolicy)

  const cleanup = (): void => {
    disposed = true
    removeAppCreatedHook()
    removeAppMountedHook()
    restoreScrollBehavior?.()
    restoreScrollBehavior = null
    if (settledFrame !== null) window.cancelAnimationFrame(settledFrame)
    settledFrame = null
    reducedMotion.removeEventListener("change", applyPolicy)
    forcedColors.removeEventListener("change", applyPolicy)
    connection?.removeEventListener?.("change", applyPolicy)
  }

  nuxtApp.vueApp.onUnmount(cleanup)
  import.meta.hot?.dispose(cleanup)
})
