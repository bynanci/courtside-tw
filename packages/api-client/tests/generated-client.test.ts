import assert from "node:assert/strict"
import test from "node:test"
import { createApiClient } from "../src/index.ts"

const respondWith = (body: unknown, status: number, contentType: string) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": contentType },
    status
  })

test("uses generated operation types and serializes a public issue request", async () => {
  let capturedRequest: Request | undefined
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input, init)
      return respondWith(
        { items: [], page: { nextCursor: null, limit: 10 } },
        200,
        "application/json"
      )
    }
  })

  const result = await client.GET("/api/v1/public/issues", {
    params: { query: { limit: 10 } }
  })

  assert.equal(result.response.status, 200)
  assert.deepEqual(result.data, {
    items: [],
    page: { nextCursor: null, limit: 10 }
  })
  assert.equal(capturedRequest?.url, "https://api.example.test/api/v1/public/issues?limit=10")
  assert.equal(capturedRequest?.credentials, "include")
})

test("serializes generated path parameters and preserves typed error responses", async () => {
  let capturedRequest: Request | undefined
  const client = createApiClient({
    baseUrl: "https://api.example.test/",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input, init)
      return respondWith(
        {
          type: "https://courtside.tw/problems/not-found",
          title: "Resource not found",
          status: 404,
          code: "RESOURCE_NOT_FOUND",
          detail: "Issue does not exist"
        },
        404,
        "application/problem+json"
      )
    }
  })

  const result = await client.GET("/api/v1/public/issues/{issueSlug}", {
    params: { path: { issueSlug: "opening-night" } }
  })

  assert.equal(result.response.status, 404)
  assert.equal(result.data, undefined)
  assert.equal(result.error?.code, "RESOURCE_NOT_FOUND")
  assert.equal(capturedRequest?.url, "https://api.example.test/api/v1/public/issues/opening-night")
})

test("generated Reader Stamp claim keeps eligibility on the server and sends its idempotency key", async () => {
  let capturedRequest: Request | undefined
  const id = "0190f7b0-7c4b-7e3a-8f12-123456789abc"
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input, init)
      return respondWith(
        {
          id,
          season: "2026",
          credentialType: "READER_STAMP",
          status: "CLAIMED",
          issuedAt: "2026-09-12T00:00:00Z",
          expiresAt: "2028-01-01T00:00:00Z",
          version: 0
        },
        200,
        "application/json"
      )
    }
  })
  const result = await client.POST("/api/v1/me/passport/claims", {
    params: { header: { "Idempotency-Key": "passport-contract" } },
    body: { issueId: id, season: "2026" }
  })
  assert.equal(result.data?.status, "CLAIMED")
  assert.equal(capturedRequest?.headers.get("idempotency-key"), "passport-contract")
  assert.deepEqual(await capturedRequest?.json(), { issueId: id, season: "2026" })
})
