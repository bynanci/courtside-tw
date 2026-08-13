export type ActiveLoopCoordinator = {
  claim: (owner: string, pause: () => void) => void
  release: (owner: string) => void
  currentOwner: () => string | null
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
