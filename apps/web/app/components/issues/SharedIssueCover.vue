<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"

import {
  captureSharedIssueCover,
  discardSharedIssueCover,
  playSharedIssueCover,
  readerMotionNavigationSettledEvent
} from "../../features/motion/shared-issue-cover"

const props = defineProps<{
  src: string
  alt: string
  width: number
  height: number
  issueSlug: string
  transitionRole: "source" | "target"
  priority?: boolean
}>()

const frame = ref<HTMLElement | null>(null)
let activeAnimation: Animation | null = null
let disposed = false

function capture(event?: MouseEvent): void {
  captureSharedIssueCover(frame.value, props.issueSlug, event)
}

defineExpose({ capture })

function playAfterNavigationSettles(): void {
  if (disposed) return
  if (document.hidden) {
    discardSharedIssueCover(props.issueSlug)
    return
  }
  activeAnimation = playSharedIssueCover(frame.value, props.issueSlug)
}

onMounted(() => {
  if (props.transitionRole !== "target") return
  if (document.hidden) {
    discardSharedIssueCover(props.issueSlug)
    return
  }
  window.addEventListener(readerMotionNavigationSettledEvent, playAfterNavigationSettles, {
    once: true
  })
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener(readerMotionNavigationSettledEvent, playAfterNavigationSettles)
  activeAnimation?.cancel()
  activeAnimation = null
})
</script>

<template>
  <div
    ref="frame"
    data-motion-pattern="issue-cover-carry"
    data-motion-part="issue-cover"
    :data-motion-role="transitionRole"
    :data-issue-slug="issueSlug"
  >
    <img
      :src="src"
      :alt="alt"
      :width="width"
      :height="height"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : 'auto'"
      decoding="async"
    />
  </div>
</template>
