export type ActiveLoopCoordinator = {
  claim: (owner: string, pause: () => void) => void
  release: (owner: string) => void
  currentOwner: () => string | null
}

export type FrameThrottleState = {
  consecutiveSlowFrames: number
  suspend: boolean
}

export function nextFrameThrottleState(input: {
  previousTimestamp: number
  currentTimestamp: number
  consecutiveSlowFrames: number
  thresholdMilliseconds: number
  requiredConsecutiveSlowFrames: number
}): FrameThrottleState {
  const slowFrame =
    input.previousTimestamp > 0 &&
    input.currentTimestamp - input.previousTimestamp >= input.thresholdMilliseconds
  const consecutiveSlowFrames = slowFrame
    ? Math.max(0, Math.floor(input.consecutiveSlowFrames)) + 1
    : 0

  return {
    consecutiveSlowFrames,
    suspend: consecutiveSlowFrames >= Math.max(1, Math.floor(input.requiredConsecutiveSlowFrames))
  }
}

export function createActiveLoopCoordinator(): ActiveLoopCoordinator {
  let active: { owner: string; pause: () => void } | null = null

  return {
    claim(owner, pause) {
      if (active?.owner === owner) {
        active = { owner, pause }
        return
      }
      active?.pause()
      active = { owner, pause }
    },
    release(owner) {
      if (active?.owner === owner) {
        active = null
      }
    },
    currentOwner() {
      return active?.owner ?? null
    }
  }
}

export const creativeActiveLoop = createActiveLoopCoordinator()
