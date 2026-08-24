export const readerMotionPatterns = [
  "route-orient",
  "issue-cover-carry",
  "toc-unfold",
  "reading-progress-track",
  "action-confirm"
] as const

export const readerMotion = {
  allowedPatterns: readerMotionPatterns,
  primitive: {
    durationMs: {
      none: 0,
      pressIn: 80,
      progress: 90,
      exit: 140,
      pressOut: 140,
      fallback: 180,
      enter: 220,
      sharedMax: 360
    },
    distancePx: { none: 0, xs: 4, sm: 8 },
    scale: { rest: 1, press: 0.98 },
    easing: {
      enter: "cubic-bezier(0.16, 1, 0.3, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)"
    },
    spring: {
      issueCover: { stiffness: 320, damping: 32, mass: 0.9 }
    }
  },
  route: {
    full: {
      durationMs: 220,
      enterMs: 220,
      exitMs: 140,
      distancePx: 8,
      enterEasing: "cubic-bezier(0.16, 1, 0.3, 1)",
      exitEasing: "cubic-bezier(0.4, 0, 1, 1)"
    },
    reduced: {
      durationMs: 0,
      enterMs: 0,
      exitMs: 0,
      distancePx: 0,
      enterEasing: "linear",
      exitEasing: "linear"
    }
  },
  issueCover: {
    full: {
      durationMs: 360,
      fallbackDurationMs: 180,
      spring: { stiffness: 320, damping: 32, mass: 0.9 }
    },
    reduced: {
      durationMs: 0,
      fallbackDurationMs: 0,
      spring: { stiffness: 0, damping: 0, mass: 0.9 }
    }
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

export const readerMotionCssVariables = {
  "--motion-duration-none": `${readerMotion.primitive.durationMs.none}ms`,
  "--motion-duration-press-in": `${readerMotion.primitive.durationMs.pressIn}ms`,
  "--motion-duration-progress": `${readerMotion.primitive.durationMs.progress}ms`,
  "--motion-duration-exit": `${readerMotion.primitive.durationMs.exit}ms`,
  "--motion-duration-press-out": `${readerMotion.primitive.durationMs.pressOut}ms`,
  "--motion-duration-fallback": `${readerMotion.primitive.durationMs.fallback}ms`,
  "--motion-duration-enter": `${readerMotion.primitive.durationMs.enter}ms`,
  "--motion-duration-shared": `${readerMotion.primitive.durationMs.sharedMax}ms`,
  "--motion-distance-unfold": `${readerMotion.primitive.distancePx.xs}px`,
  "--motion-distance-orient": `${readerMotion.primitive.distancePx.sm}px`,
  "--motion-scale-press": String(readerMotion.primitive.scale.press),
  "--motion-easing-enter": readerMotion.primitive.easing.enter,
  "--motion-easing-exit": readerMotion.primitive.easing.exit
} as const satisfies Record<string, string>
