export const readerMotion = {
  route: {
    full: { durationMs: 220, distancePx: 8 },
    reduced: { durationMs: 0, distancePx: 0 }
  },
  tocReveal: {
    full: { durationMs: 220, distancePx: 4, staggerMs: 32, maximumItems: 6 },
    reduced: { durationMs: 0, distancePx: 0, staggerMs: 0, maximumItems: 0 }
  },
  readingProgress: {
    full: { durationMs: 90 },
    reduced: { durationMs: 0 }
  },
  press: {
    full: { enterMs: 80, exitMs: 140, scale: 0.98 },
    reduced: { enterMs: 0, exitMs: 0, scale: 1 }
  }
} as const

export type ReaderMotionMode = "full" | "reduced"
