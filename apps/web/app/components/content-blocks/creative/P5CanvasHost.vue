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
  creativeActiveLoop.release(props.ownerId)
  document.removeEventListener("visibilitychange", handleVisibility)
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
