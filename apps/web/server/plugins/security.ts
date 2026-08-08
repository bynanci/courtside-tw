import { applySecurityHeaders } from "../security/headers"

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    applySecurityHeaders(event.node.res)
  })
})
