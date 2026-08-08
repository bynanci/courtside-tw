const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/

function correlationId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : crypto.randomUUID()
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    const requestId = correlationId(event.node.req.headers["x-request-id"])
    const traceId = correlationId(event.node.req.headers["x-trace-id"])

    event.context.observability = { requestId, traceId }
    event.node.res.setHeader("x-request-id", requestId)
    event.node.res.setHeader("x-trace-id", traceId)
  })
})
