import { randomBytes } from "node:crypto"

import { applySecurityHeaders } from "../security/headers"

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    const nonce = randomBytes(16).toString("base64")
    event.context.cspNonce = nonce
    applySecurityHeaders(event.node.res, nonce)
  })

  nitroApp.hooks.hook("render:html", (html, { event }) => {
    const nonce = event.context.cspNonce
    if (typeof nonce !== "string") {
      return
    }
    for (const key of ["head", "body", "bodyAppend"] as const) {
      const chunks = html[key]
      if (!Array.isArray(chunks)) {
        continue
      }
      html[key] = chunks.map((chunk) =>
        chunk
          .replace(/<script\\b(?![^>]*\\bnonce=)/gi, '<script nonce="' + nonce + '"')
          .replace(/<style\\b(?![^>]*\\bnonce=)/gi, '<style nonce="' + nonce + '"')
      )
    }
  })
})
