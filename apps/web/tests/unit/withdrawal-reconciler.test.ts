import { deepEqual, equal, rejects, throws } from "node:assert/strict"
import { test } from "node:test"

import {
  WithdrawalReconciler,
  withBoundedRetry
} from "../../app/features/offline/services/WithdrawalReconciler.ts"

test("withdrawal retry succeeds within the fixed attempt budget", async () => {
  const attempts: number[] = []
  const delays: number[] = []

  const result = await withBoundedRetry(
    async (attempt) => {
      attempts.push(attempt)
      if (attempt < 3) throw new Error("temporary")
      return "verified"
    },
    {
      delaysMs: [10, 20],
      sleep: async (delayMs) => {
        delays.push(delayMs)
      }
    }
  )

  equal(result, "verified")
  deepEqual(attempts, [1, 2, 3])
  deepEqual(delays, [10, 20])
})

test("withdrawal retry stops at the bound and skips non-retryable errors", async () => {
  let exhaustedAttempts = 0
  await rejects(
    withBoundedRetry(
      async () => {
        exhaustedAttempts += 1
        throw new Error("still unavailable")
      },
      { delaysMs: [0, 0], sleep: async () => undefined }
    ),
    /still unavailable/
  )
  equal(exhaustedAttempts, 3)

  let nonRetryableAttempts = 0
  await rejects(
    withBoundedRetry(
      async () => {
        nonRetryableAttempts += 1
        throw new Error("corrupt")
      },
      {
        delaysMs: [0, 0],
        shouldRetry: () => false,
        sleep: async () => undefined
      }
    ),
    /corrupt/
  )
  equal(nonRetryableAttempts, 1)
})

test("online reconciler coalesces targets and records fail-closed outcomes", async () => {
  const reconciler = new WithdrawalReconciler({
    eventTarget: new EventTarget(),
    isOnline: () => true,
    intervalMs: null,
    listTargets: async () => [
      {
        issueSlug: "issue-2026-01",
        reconcile: async () => ({ status: "available" as const })
      },
      {
        issueSlug: "issue-2026-01",
        reconcile: async () => ({ status: "withdrawn" as const })
      },
      {
        issueSlug: "issue-2025-12",
        reconcile: async () => {
          throw new Error("failed closed")
        }
      }
    ]
  })

  const summary = await reconciler.reconcileNow()

  deepEqual(summary, {
    checked: 2,
    available: 1,
    withdrawn: 0,
    none: 0,
    failedClosed: 1,
    results: [
      { issueSlug: "issue-2026-01", status: "available" },
      { issueSlug: "issue-2025-12", status: "failed-closed" }
    ]
  })
})

test("online event starts reconciliation and stop removes the listener", async () => {
  const eventTarget = new EventTarget()
  let online = false
  let calls = 0
  let markReconciled: (() => void) | undefined
  const reconciled = new Promise<void>((resolve) => {
    markReconciled = resolve
  })
  const reconciler = new WithdrawalReconciler({
    eventTarget,
    isOnline: () => online,
    intervalMs: null,
    listTargets: async () => [
      {
        issueSlug: "issue-2026-01",
        reconcile: async () => {
          calls += 1
          markReconciled?.()
          return { status: "withdrawn" as const }
        }
      }
    ]
  })

  reconciler.start()
  equal(calls, 0)
  online = true
  eventTarget.dispatchEvent(new Event("online"))
  await reconciled
  equal(calls, 1)

  reconciler.stop()
  eventTarget.dispatchEvent(new Event("online"))
  await Promise.resolve()
  equal(calls, 1)
})

test("invalid scheduling policy fails before online reconciliation is started", () => {
  const eventTarget = new EventTarget()
  let calls = 0
  const reconciler = new WithdrawalReconciler({
    eventTarget,
    isOnline: () => true,
    intervalMs: 0,
    listTargets: async () => {
      calls += 1
      return []
    }
  })

  throws(() => reconciler.start(), /positive integer/)
  eventTarget.dispatchEvent(new Event("online"))
  equal(calls, 0)
})
