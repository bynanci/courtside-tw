import { buildOfflineAppShellWorker } from "../../app/service-worker/offline-app-shell"

export default defineEventHandler((event) => {
  setHeader(event, "content-type", "application/javascript; charset=utf-8")
  setHeader(event, "cache-control", "no-cache")
  setHeader(event, "service-worker-allowed", "/")
  return buildOfflineAppShellWorker()
})
