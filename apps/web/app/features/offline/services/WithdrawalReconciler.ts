export const DEFAULT_WITHDRAWAL_RETRY_DELAYS_MS = Object.freeze([250, 1_000] as const)
export const DEFAULT_WITHDRAWAL_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1_000

const MAX_RETRY_DELAYS = 4
const MAX_RETRY_DELAY_MS = 30_000

export type WithdrawalReconciliationStatus = "none" | "available" | "withdrawn"

export type WithdrawalReconciliationTarget = {
  issueSlug: string
  reconcile: () => Promise<{ status: WithdrawalReconciliationStatus }>
}

export type WithdrawalReconciliationResult = {
  issueSlug: string
  status: WithdrawalReconciliationStatus | "failed-closed"
}

export type WithdrawalReconciliationSummary = {
  checked: number
  available: number
  withdrawn: number
  none: number
  failedClosed: number
  results: WithdrawalReconciliationResult[]
}

type BoundedRetryOptions = {
  delaysMs?: readonly number[]
  shouldRetry?: (error: unknown) => boolean
  sleep?: (delayMs: number) => Promise<void>
}

type OnlineEventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">

type WithdrawalReconcilerOptions = {
  listTargets: () => Promise<readonly WithdrawalReconciliationTarget[]>
  eventTarget: OnlineEventTarget
  isOnline: () => boolean
  intervalMs?: number | null
  onComplete?: (summary: WithdrawalReconciliationSummary) => void
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  clearInterval?: (handle: ReturnType<typeof setInterval>) => void
}

export async function withBoundedRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: BoundedRetryOptions = {}
): Promise<T> {
  const delays = [...(options.delaysMs ?? DEFAULT_WITHDRAWAL_RETRY_DELAYS_MS)]
  assertBoundedRetryDelays(delays)
  const shouldRetry = options.shouldRetry ?? (() => true)
  const sleep = options.sleep ?? wait

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      const delay = delays[attempt - 1]
      if (delay === undefined || !shouldRetry(error)) {
        throw error
      }
      await sleep(delay)
    }
  }
}

export class WithdrawalReconciler {
  private readonly options: WithdrawalReconcilerOptions
  private readonly onlineListener: EventListener
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private inFlight: Promise<WithdrawalReconciliationSummary> | null = null
  private started = false

  constructor(options: WithdrawalReconcilerOptions) {
    this.options = options
    this.onlineListener = () => {
      if (this.options.isOnline()) {
        void this.reconcileNow().catch(() => undefined)
      }
    }
  }

  start(): void {
    if (this.started) return
    const intervalMs =
      this.options.intervalMs === undefined
        ? DEFAULT_WITHDRAWAL_RECONCILIATION_INTERVAL_MS
        : this.options.intervalMs
    if (intervalMs !== null && (!Number.isSafeInteger(intervalMs) || intervalMs < 1)) {
      throw new TypeError("withdrawal reconciliation interval must be a positive integer")
    }

    this.started = true
    this.options.eventTarget.addEventListener("online", this.onlineListener)
    if (intervalMs !== null) {
      const schedule = this.options.setInterval ?? globalThis.setInterval
      this.intervalHandle = schedule(() => {
        if (this.options.isOnline()) {
          void this.reconcileNow().catch(() => undefined)
        }
      }, intervalMs)
    }

    if (this.options.isOnline()) {
      void this.reconcileNow().catch(() => undefined)
    }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.options.eventTarget.removeEventListener("online", this.onlineListener)
    if (this.intervalHandle !== null) {
      const cancel = this.options.clearInterval ?? globalThis.clearInterval
      cancel(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  reconcileNow(): Promise<WithdrawalReconciliationSummary> {
    if (this.inFlight) return this.inFlight

    const run = this.run().finally(() => {
      if (this.inFlight === run) {
        this.inFlight = null
      }
    })
    this.inFlight = run
    return run
  }

  private async run(): Promise<WithdrawalReconciliationSummary> {
    const summary = emptySummary()
    if (!this.options.isOnline()) {
      return summary
    }

    const targets = await this.options.listTargets()
    const seen = new Set<string>()
    for (const target of targets) {
      if (seen.has(target.issueSlug)) continue
      seen.add(target.issueSlug)
      summary.checked += 1

      try {
        const result = await target.reconcile()
        summary[result.status] += 1
        summary.results.push({ issueSlug: target.issueSlug, status: result.status })
      } catch {
        summary.failedClosed += 1
        summary.results.push({ issueSlug: target.issueSlug, status: "failed-closed" })
      }
    }

    try {
      this.options.onComplete?.(summary)
    } catch {
      // Reconciliation authority must not depend on optional UI notification hooks.
    }
    return summary
  }
}

function assertBoundedRetryDelays(delays: readonly number[]): void {
  if (
    delays.length > MAX_RETRY_DELAYS ||
    delays.some((delay) => !Number.isSafeInteger(delay) || delay < 0 || delay > MAX_RETRY_DELAY_MS)
  ) {
    throw new TypeError("withdrawal retry delays exceed the bounded policy")
  }
}

function emptySummary(): WithdrawalReconciliationSummary {
  return {
    checked: 0,
    available: 0,
    withdrawn: 0,
    none: 0,
    failedClosed: 0,
    results: []
  }
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs))
}
