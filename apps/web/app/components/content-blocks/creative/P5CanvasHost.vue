<script setup lang="ts">
import {
  boundedCanvasWidth,
  creativeActiveLoop,
  nextPauseTimerState,
  normalizeCourtPulseParameters,
  resolveCreativePreset,
  runtimeVisibilityDecision,
  type CreativePresetModule
} from "@courtside/creative-runtime"
import type p5 from "p5"
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

type Props = {
  ownerId: string
  presetId: string
  seed: number
  parameters: unknown
  altText: string
  enabled: boolean
  reducedMotion: boolean
}

const props = defineProps<Props>()
const container = ref<HTMLDivElement | null>(null)
const nearViewport = ref(false)
const intersectionRatio = ref(0)
const runtimeStatus = ref<"idle" | "loading" | "running" | "paused" | "error" | "removed">("idle")
const frameTick = ref(0)
let sketch: p5 | null = null
let preloadObserver: IntersectionObserver | null = null
let visibilityObserver: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let pauseTimer: ReturnType<typeof setTimeout> | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let selectionFrame: number | null = null
let setupFrame: number | null = null
let runtimeModules: Promise<{
  P5: (typeof import("p5"))["default"]
  presetModule: CreativePresetModule
}> | null = null
let disposed = false

function hostWidth(): number {
  return boundedCanvasWidth(container.value?.getBoundingClientRect().width ?? 280, 180, 1)
}

function shouldMount(): boolean {
  return (
    runtimeVisibilityDecision({
      intersectionRatio: intersectionRatio.value,
      documentVisible: !document.hidden
    }).run && props.enabled
  )
}

function shouldRun(): boolean {
  return shouldMount() && !props.reducedMotion
}

function measuredViewportRatio(host: HTMLElement): number {
  const rectangle = host.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (rectangle.height <= 0 || viewportHeight <= 0) {
    return 0
  }
  const visibleHeight = Math.max(
    0,
    Math.min(rectangle.bottom, viewportHeight) - Math.max(rectangle.top, 0)
  )
  return Math.min(1, visibleHeight / rectangle.height)
}

function isPreferredVisibleHost(): boolean {
  const host = container.value
  if (!host) {
    return false
  }
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid="creative-runtime"][data-runtime-active="true"]'
    )
  )
    .map((candidate) => ({
      candidate,
      ratio: measuredViewportRatio(candidate),
      top: Math.abs(candidate.getBoundingClientRect().top)
    }))
    .filter(({ ratio }) => ratio >= 0.25)
    .sort((left, right) => right.ratio - left.ratio || left.top - right.top)
  return candidates[0]?.candidate === host
}

function clearPauseTimer(): void {
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
}

function pauseSketch(): void {
  clearPauseTimer()
  creativeActiveLoop.release(props.ownerId)
  sketch?.noLoop()
  runtimeStatus.value = sketch ? "paused" : "idle"
}

function schedulePause(): void {
  if (pauseTimer !== null) {
    return
  }
  pauseTimer = setTimeout(() => {
    pauseTimer = null
    pauseSketch()
  }, 250)
}

function applyLoopState(): void {
  if (!sketch) {
    return
  }
  const decision = runtimeVisibilityDecision({
    intersectionRatio: intersectionRatio.value,
    documentVisible: !document.hidden
  })
  if (!props.enabled || props.reducedMotion || document.hidden) {
    pauseSketch()
    return
  }
  if (decision.delayedPause) {
    schedulePause()
    return
  }
  if (nextPauseTimerState(pauseTimer === null ? "clear" : "scheduled", decision) === "clear") {
    clearPauseTimer()
  }
  if (!shouldRun()) {
    // The 10–25% band intentionally preserves the current state to avoid
    // thrashing while the reader scrolls across the activation threshold.
    return
  }
  if (!isPreferredVisibleHost()) {
    pauseSketch()
    return
  }
  creativeActiveLoop.claim(props.ownerId, () => {
    sketch?.noLoop()
    runtimeStatus.value = "paused"
  })
  sketch.loop()
  runtimeStatus.value = "running"
}

async function preloadRuntime() {
  const preset = resolveCreativePreset(props.presetId)
  if (!props.enabled || (!nearViewport.value && !shouldMount()) || !preset || disposed) {
    return null
  }
  if (!runtimeModules) {
    runtimeStatus.value = "loading"
    runtimeModules = Promise.all([import("p5"), preset.load()]).then(
      ([{ default: P5 }, presetModule]) => {
        if (!sketch && !shouldMount()) {
          runtimeStatus.value = "paused"
        }
        return { P5, presetModule }
      }
    )
  }
  return runtimeModules
}

async function mountSketch(): Promise<void> {
  const host = container.value
  if (!host || sketch || disposed || !shouldMount()) {
    applyLoopState()
    return
  }
  try {
    const modules = await preloadRuntime()
    if (!modules) {
      runtimeStatus.value = "idle"
      return
    }
    const { P5, presetModule } = await modules
    if (disposed || !container.value || !shouldMount()) {
      runtimeStatus.value = "idle"
      return
    }
    const createSketch = presetModule.createSketch({
      seed: props.seed,
      parameters: normalizeCourtPulseParameters(props.parameters),
      host,
      width: hostWidth,
      onFrame: (frame) => {
        frameTick.value = frame
        if (frame === 0 && setupFrame === null) {
          setupFrame = window.requestAnimationFrame(() => {
            setupFrame = null
            if (!disposed) {
              applyLoopState()
            }
          })
        }
      }
    })
    sketch = new P5(createSketch as (instance: p5) => void, host)
    observeResize(host)
    await nextTick()
    applyLoopState()
  } catch {
    creativeActiveLoop.release(props.ownerId)
    sketch?.remove()
    sketch = null
    runtimeStatus.value = "error"
  }
}

function observeResize(host: HTMLDivElement): void {
  if (typeof ResizeObserver === "undefined" || resizeObserver) {
    return
  }
  resizeObserver = new ResizeObserver(() => {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer)
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      if (!sketch) {
        return
      }
      sketch.resizeCanvas(hostWidth(), 180, true)
      if (!sketch.isLooping()) {
        sketch.redraw()
      }
    }, 100)
  })
  resizeObserver.observe(host)
}

function handleVisibility(): void {
  if (document.hidden) {
    pauseSketch()
    return
  }
  void mountSketch()
}

function syncViewportSelection(): void {
  const host = container.value
  if (!host) {
    return
  }
  intersectionRatio.value = measuredViewportRatio(host)
  if (intersectionRatio.value >= 0.25) {
    void mountSketch()
  } else {
    applyLoopState()
  }
}

function handleViewportSelection(): void {
  if (selectionFrame !== null) {
    return
  }
  selectionFrame = window.requestAnimationFrame(() => {
    selectionFrame = null
    syncViewportSelection()
  })
}

watch(
  () => [props.enabled, props.reducedMotion] as const,
  () => {
    if (!props.enabled || props.reducedMotion) {
      pauseSketch()
      return
    }
    void preloadRuntime()
    void mountSketch()
  }
)

onMounted(() => {
  const host = container.value
  if (!host) {
    return
  }
  document.addEventListener("visibilitychange", handleVisibility)
  window.addEventListener("scroll", handleViewportSelection, { passive: true })
  if (typeof IntersectionObserver === "undefined") {
    nearViewport.value = true
    intersectionRatio.value = 1
    void preloadRuntime()
    void mountSketch()
    return
  }

  preloadObserver = new IntersectionObserver(
    ([entry]) => {
      nearViewport.value = entry?.isIntersecting === true
      if (nearViewport.value) {
        void preloadRuntime()
      }
    },
    { rootMargin: "100% 0px", threshold: 0 }
  )
  visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      intersectionRatio.value = entry?.isIntersecting ? entry.intersectionRatio : 0
      if (intersectionRatio.value >= 0.25) {
        void mountSketch()
      } else {
        applyLoopState()
      }
    },
    { threshold: [0, 0.1, 0.25] }
  )
  preloadObserver.observe(host)
  visibilityObserver.observe(host)
})

onBeforeUnmount(() => {
  disposed = true
  clearPauseTimer()
  if (resizeTimer !== null) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  if (selectionFrame !== null) {
    window.cancelAnimationFrame(selectionFrame)
    selectionFrame = null
  }
  if (setupFrame !== null) {
    window.cancelAnimationFrame(setupFrame)
    setupFrame = null
  }
  creativeActiveLoop.release(props.ownerId)
  document.removeEventListener("visibilitychange", handleVisibility)
  window.removeEventListener("scroll", handleViewportSelection)
  preloadObserver?.disconnect()
  preloadObserver = null
  visibilityObserver?.disconnect()
  visibilityObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
  sketch?.noLoop()
  sketch?.remove()
  sketch = null
  runtimeStatus.value = "removed"
})
</script>

<template>
  <div
    ref="container"
    data-testid="creative-runtime"
    data-runtime-engine="p5"
    :data-runtime-status="runtimeStatus"
    :data-runtime-active="String(props.enabled)"
    :data-runtime-near-viewport="String(nearViewport)"
    :data-runtime-intersection-ratio="String(intersectionRatio)"
    :data-runtime-frame="String(frameTick)"
    role="img"
    :aria-label="props.altText"
  />
</template>
