import { readerMotion } from "./reader-motion.ts"

export type IssueCoverRect = {
  left: number
  top: number
  width: number
  height: number
}

type SharedIssueCoverSnapshot = {
  issueSlug: string
  rect: IssueCoverRect
  capturedAt: number
}

export type SharedIssueCoverKeyframe = {
  offset: number
  opacity?: number
  transform?: string
}

export type SharedIssueCoverPlan = {
  kind: "spring" | "fade"
  durationMs: number
  keyframes: SharedIssueCoverKeyframe[]
}

const maximumSnapshotAgeMs = 2_000
const maximumAspectDifference = 0.035
const maximumTravelViewportRatio = 0.46
let pendingSnapshot: SharedIssueCoverSnapshot | null = null

export const readerMotionNavigationSettledEvent = "courtside:reader-motion-navigation-settled"

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function validRect(rect: IssueCoverRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    finitePositive(rect.width) &&
    finitePositive(rect.height)
  )
}

function fixed(value: number): string {
  if (Math.abs(value) < 0.0001) return "0"
  return String(Number(value.toFixed(4)))
}

function rectFromDom(rect: DOMRect): IssueCoverRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function isEligibleNavigation(event?: MouseEvent): boolean {
  if (!event) return true
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

export function sampleNoOvershootSpring(steps = 12): number[] {
  const safeSteps = Math.max(2, Math.floor(steps))
  const { stiffness, damping, mass } = readerMotion.issueCover.full.spring
  const durationSeconds = readerMotion.issueCover.full.durationMs / 1_000
  const naturalFrequency = Math.sqrt(stiffness / mass)
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass))
  const dampedFrequency = naturalFrequency * Math.sqrt(Math.max(0, 1 - dampingRatio ** 2))
  const samples: number[] = []
  let previous = 0

  for (let index = 0; index <= safeSteps; index += 1) {
    if (index === 0) {
      samples.push(0)
      continue
    }
    if (index === safeSteps) {
      samples.push(1)
      continue
    }

    const elapsed = (index / safeSteps) * durationSeconds
    const decay = Math.exp(-dampingRatio * naturalFrequency * elapsed)
    const response =
      dampedFrequency === 0
        ? 1 - decay
        : 1 -
          decay *
            (Math.cos(dampedFrequency * elapsed) +
              (dampingRatio / Math.sqrt(1 - dampingRatio ** 2)) *
                Math.sin(dampedFrequency * elapsed))
    const bounded = Math.min(1, Math.max(previous, response))
    previous = bounded
    samples.push(bounded)
  }

  return samples
}

export function buildSharedIssueCoverPlan(
  source: IssueCoverRect,
  target: IssueCoverRect,
  context: { capturedAt: number; now: number; viewportWidth: number }
): SharedIssueCoverPlan | null {
  const age = context.now - context.capturedAt
  if (!validRect(source) || !validRect(target) || age < 0 || age > maximumSnapshotAgeMs) {
    return null
  }

  const sourceAspect = source.width / source.height
  const targetAspect = target.width / target.height
  const aspectDifference = Math.abs(sourceAspect - targetAspect) / targetAspect
  const sourceCenterX = source.left + source.width / 2
  const sourceCenterY = source.top + source.height / 2
  const targetCenterX = target.left + target.width / 2
  const targetCenterY = target.top + target.height / 2
  const travel = Math.hypot(targetCenterX - sourceCenterX, targetCenterY - sourceCenterY)
  const excessiveTravel =
    !finitePositive(context.viewportWidth) ||
    travel / context.viewportWidth > maximumTravelViewportRatio

  if (aspectDifference > maximumAspectDifference || excessiveTravel) {
    return {
      kind: "fade",
      durationMs: readerMotion.issueCover.full.fallbackDurationMs,
      keyframes: [
        { offset: 0, opacity: 0.72 },
        { offset: 1, opacity: 1 }
      ]
    }
  }

  const translateX = source.left - target.left
  const translateY = source.top - target.top
  const sourceScale = (source.width / target.width + source.height / target.height) / 2
  const samples = sampleNoOvershootSpring()
  const lastIndex = samples.length - 1
  const keyframes = samples.map((progress, index): SharedIssueCoverKeyframe => {
    const inverse = 1 - progress
    const x = translateX * inverse
    const y = translateY * inverse
    const scale = sourceScale + (1 - sourceScale) * progress
    return {
      offset: index / lastIndex,
      transform: `translate3d(${fixed(x)}px, ${fixed(y)}px, 0) scale(${fixed(scale)})`
    }
  })

  return {
    kind: "spring",
    durationMs: readerMotion.issueCover.full.durationMs,
    keyframes
  }
}

export function captureSharedIssueCover(
  element: HTMLElement | null,
  issueSlug: string,
  event?: MouseEvent
): void {
  pendingSnapshot = null
  if (
    !element ||
    !issueSlug ||
    !isEligibleNavigation(event) ||
    document.documentElement.dataset.readerMotionCover !== "enabled"
  ) {
    return
  }

  const rect = rectFromDom(element.getBoundingClientRect())
  if (!validRect(rect)) return
  pendingSnapshot = { issueSlug, rect, capturedAt: Date.now() }
}

export function discardSharedIssueCover(issueSlug?: string): void {
  if (!issueSlug || pendingSnapshot?.issueSlug === issueSlug) {
    pendingSnapshot = null
  }
}

export function playSharedIssueCover(
  element: HTMLElement | null,
  issueSlug: string
): Animation | null {
  if (
    !element ||
    !pendingSnapshot ||
    pendingSnapshot.issueSlug !== issueSlug ||
    document.documentElement.dataset.readerMotionCover !== "enabled" ||
    typeof element.animate !== "function"
  ) {
    pendingSnapshot = null
    return null
  }

  const snapshot = pendingSnapshot
  pendingSnapshot = null
  const plan = buildSharedIssueCoverPlan(
    snapshot.rect,
    rectFromDom(element.getBoundingClientRect()),
    {
      capturedAt: snapshot.capturedAt,
      now: Date.now(),
      viewportWidth: window.innerWidth
    }
  )
  if (!plan) return null

  const image = element.querySelector("img")
  const keyframes =
    image instanceof HTMLImageElement && !image.complete
      ? [
          { offset: 0, opacity: 0.72 },
          { offset: 1, opacity: 1 }
        ]
      : plan.keyframes
  const animation = element.animate(keyframes, {
    duration:
      keyframes === plan.keyframes
        ? plan.durationMs
        : readerMotion.issueCover.full.fallbackDurationMs,
    easing: "linear",
    fill: "both"
  })
  void animation.finished.then(() => animation.cancel()).catch(() => undefined)
  return animation
}
