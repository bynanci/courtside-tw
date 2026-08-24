export type ReaderMotionPatternFlags = {
  route: boolean
  issueCover: boolean
  tocReveal: boolean
  readingProgress: boolean
  feedback: boolean
}

export type ReaderMotionFlags = ReaderMotionPatternFlags & {
  enabled: boolean
}

export type ReaderMotionPolicyMode = "disabled" | "reduced" | "full"

export type ReaderMotionPolicy = {
  mode: ReaderMotionPolicyMode
  patterns: ReaderMotionPatternFlags
  creativeMotionMode: "reduced" | "full"
  interactiveEnhancementsAllowed: boolean
}

export const defaultReaderMotionFlags: Readonly<ReaderMotionFlags> = {
  enabled: true,
  route: true,
  issueCover: true,
  tocReveal: false,
  readingProgress: true,
  feedback: true
}

const disabledPatterns: Readonly<ReaderMotionPatternFlags> = {
  route: false,
  issueCover: false,
  tocReveal: false,
  readingProgress: false,
  feedback: false
}

export const staticReaderMotionPolicy: Readonly<ReaderMotionPolicy> = {
  mode: "reduced",
  patterns: { ...disabledPatterns },
  creativeMotionMode: "reduced",
  interactiveEnhancementsAllowed: false
}

export function resolveReaderMotionPolicy(input: {
  flags: ReaderMotionFlags
  prefersReducedMotion: boolean
  saveData: boolean
  forcedColors?: boolean
}): ReaderMotionPolicy {
  const creativeMotionMode =
    input.prefersReducedMotion || input.forcedColors === true ? "reduced" : "full"

  if (!input.flags.enabled) {
    return {
      mode: "disabled",
      patterns: { ...disabledPatterns },
      creativeMotionMode,
      interactiveEnhancementsAllowed: !(
        input.prefersReducedMotion ||
        input.saveData ||
        input.forcedColors === true
      )
    }
  }

  if (input.prefersReducedMotion || input.saveData || input.forcedColors === true) {
    return {
      mode: "reduced",
      patterns: { ...disabledPatterns },
      creativeMotionMode,
      interactiveEnhancementsAllowed: false
    }
  }

  return {
    mode: "full",
    patterns: {
      route: input.flags.route,
      issueCover: input.flags.issueCover,
      tocReveal: input.flags.tocReveal,
      readingProgress: input.flags.readingProgress,
      feedback: input.flags.feedback
    },
    creativeMotionMode,
    interactiveEnhancementsAllowed: true
  }
}
