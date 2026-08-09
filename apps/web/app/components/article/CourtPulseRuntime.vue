<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type p5 from "p5"

type CourtPulseParameters = {
  density: number
  tempo: number
  lineWeight: number
  paletteId: "court-dusk"
  numericSequence: number[]
}

type Props = {
  seed: number
  parameters: CourtPulseParameters
  altText: string
  active: boolean
  paused: boolean
  reducedMotion: boolean
}

const props = defineProps<Props>()

const container = ref<HTMLDivElement | null>(null)
const runtimeStatus = ref<"idle" | "loading" | "running" | "paused" | "error" | "removed">("idle")
let sketch: p5 | null = null
let resizeObserver: ResizeObserver | null = null
let visibilityTimer: number | null = null

const CANVAS_HEIGHT = 180

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function drawCourtPulse(instance: p5, frame: number): void {
  const { density, tempo, lineWeight, numericSequence } = props.parameters
  const width = Math.max(1, instance.width)
  const height = Math.max(1, instance.height)
  const phase = frame * clamp(tempo, 0, 2) * 0.025
  const sequence = numericSequence.length > 0 ? numericSequence : [0.5]

  instance.background(11, 15, 23)
  instance.push()
  instance.stroke(238, 241, 235, 220)
  instance.strokeWeight(clamp(lineWeight, 0.5, 10))
  instance.noFill()
  instance.rect(12, 12, width - 24, height - 24, 6)
  instance.line(width / 2, 12, width / 2, height - 12)
  instance.arc(width / 2, height / 2, 64, 64, -instance.HALF_PI, instance.HALF_PI)
  instance.arc(width / 2, height / 2, 64, 64, instance.HALF_PI, instance.HALF_PI * 3)

  const points = Math.min(48, Math.max(1, Math.round(density)))
  for (let index = 0; index < points; index += 1) {
    const ratio = sequence[index % sequence.length]
    const x = 24 + ((index + 1) / (points + 1)) * (width - 48)
    const y = height / 2 + Math.sin(phase + index * 0.73) * (height * 0.28) * (0.4 + ratio * 0.6)
    const radius = 2 + ratio * 8
    instance.fill(232, 72, 49, 190)
    instance.noStroke()
    instance.circle(x, y, radius)
  }
  instance.pop()
}

function applyLoopState(): void {
  if (!sketch) {
    return
  }
  if (!props.active || props.paused || props.reducedMotion) {
    sketch.noLoop()
    runtimeStatus.value = props.active ? "paused" : "idle"
    return
  }
  sketch.loop()
  runtimeStatus.value = "running"
}

function observeResize(host: HTMLDivElement): void {
  if (typeof ResizeObserver === "undefined") {
    return
  }
  resizeObserver = new ResizeObserver(() => {
    if (!sketch) {
      return
    }
    const width = Math.max(280, Math.floor(host.getBoundingClientRect().width))
    sketch.resizeCanvas(width, CANVAS_HEIGHT, true)
    if (!sketch.isLooping()) {
      sketch.redraw()
    }
  })
  resizeObserver.observe(host)
}

function stopVisibilityWatch(): void {
  if (visibilityTimer !== null && typeof window !== "undefined") {
    window.clearInterval(visibilityTimer)
  }
  visibilityTimer = null
}

function startVisibilityWatch(): void {
  if (typeof window === "undefined" || visibilityTimer !== null) {
    return
  }
  visibilityTimer = window.setInterval(() => {
    applyLoopState()
  }, 100)
}

async function mountSketch(): Promise<void> {
  const host = container.value
  if (!props.active || !host || sketch) {
    applyLoopState()
    return
  }

  runtimeStatus.value = "loading"
  try {
    const module = await import("p5")
    const P5 = module.default
    if (!props.active || !container.value) {
      runtimeStatus.value = "idle"
      return
    }

    sketch = new P5((instance) => {
      instance.setup = () => {
        const width = Math.max(280, Math.floor(host.getBoundingClientRect().width))
        const canvas = instance.createCanvas(width, CANVAS_HEIGHT)
        canvas.parent(host)
        instance.pixelDensity(1)
        instance.frameRate(30)
        instance.randomSeed(props.seed)
        instance.noiseSeed(props.seed)
        instance.noLoop()
        drawCourtPulse(instance, 0)
      }
      instance.draw = () => {
        drawCourtPulse(instance, instance.frameCount)
      }
    }, host)

    observeResize(host)
    startVisibilityWatch()
    await nextTick()
    applyLoopState()
  } catch {
    sketch = null
    runtimeStatus.value = "error"
  }
}

watch(
  () => [props.active, props.paused, props.reducedMotion],
  ([active]) => {
    if (active) {
      void mountSketch()
    } else {
      applyLoopState()
    }
  }
)

onMounted(() => {
  void mountSketch()
})

onBeforeUnmount(() => {
  stopVisibilityWatch()
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
    :data-runtime-active="String(active)"
    role="img"
    :aria-label="altText"
  />
</template>
