import { defineNuxtPlugin } from "#app"

import {
  listInstalledOfflineIssues,
  OfflineIssueManager
} from "../features/offline/services/OfflineIssueManager"
import { WithdrawalReconciler } from "../features/offline/services/WithdrawalReconciler"

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const reconciler = new WithdrawalReconciler({
    eventTarget: window,
    isOnline: () => navigator.onLine,
    listTargets: async () =>
      (await listInstalledOfflineIssues()).map((installed) => ({
        issueSlug: installed.issueSlug,
        reconcile: () =>
          new OfflineIssueManager(
            config.public.apiBaseUrl,
            installed.issueSlug
          ).reconcileWithdrawal()
      }))
  })

  reconciler.start()
  import.meta.hot?.dispose(() => reconciler.stop())
})
