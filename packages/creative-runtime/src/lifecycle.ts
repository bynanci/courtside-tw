const MAXIMUM_CANVAS_BITMAP_PIXELS = 1_500_000

export function runtimeVisibilityDecision(input: {
  intersectionRatio: number
  documentVisible: boolean
}): { preload: boolean; run: boolean; delayedPause: boolean } {
  const ratio = Math.min(1, Math.max(0, finite(input.intersectionRatio)))
  return {
    preload: ratio > 0,
    run: input.documentVisible && ratio >= 0.25,
    delayedPause: input.documentVisible && ratio < 0.1
  }
}

export function boundedCanvasWidth(width: number, height: number, pixelDensity: number): number {
  const safeHeight = Math.max(1, Math.floor(finite(height)))
  const density = Math.min(1.5, Math.max(1, finite(pixelDensity)))
  const maximumWidth = Math.floor(MAXIMUM_CANVAS_BITMAP_PIXELS / safeHeight / density ** 2)
  return Math.max(1, Math.min(Math.floor(finite(width)), maximumWidth))
}

export function nextPauseTimerState(
  previousState: "clear" | "scheduled",
  decision: ReturnType<typeof runtimeVisibilityDecision>
): "clear" | "scheduled" {
  if (decision.delayedPause) {
    return "scheduled"
  }
  return previousState === "scheduled" ? "clear" : previousState
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}
