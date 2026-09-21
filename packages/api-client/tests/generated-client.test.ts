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

test("generated basketball intake sends immutable identities without invented concurrency headers", async () => {
  let capturedRequest: Request | undefined
  const id = "00000000-0000-4000-8000-000000000001"
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequest = new Request(input, init)
      return respondWith({ id, status: "REPORTED", snapshotId: id }, 201, "application/json")
    }
  })
  const body = {
    source: {
      id,
      type: "LEAGUE" as const,
      name: "Synthetic source",
      sourceUrl: "https://example.invalid/official",
      publicReferenceAllowed: true
    },
    snapshotId: id,
    evidenceId: id,
    publishedAt: null,
    effectiveAt: null,
    content: "Synthetic permitted reference",
    rightsReference: "Written permission",
    confidence: 0.9,
    staleAt: "2026-09-12T11:00:00Z",
    expiresAt: "2026-09-12T12:00:00Z"
  }
  const result = await client.POST("/api/v1/publisher/basketball/snapshots", { body })
  assert.equal(result.data?.status, "REPORTED")
  assert.equal(capturedRequest?.headers.has("idempotency-key"), false)
  assert.equal(capturedRequest?.headers.has("if-match"), false)
  assert.deepEqual(await capturedRequest?.json(), body)
})

test("generated recap client sends canonical fact IDs and represents the private 404 boundary", async () => {
  const requests: Request[] = []
  const id = "00000000-0000-4000-8000-000000000021"
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      return request.method === "POST"
        ? respondWith({ schemaVersion: 1, documentId: id, blocks: [] }, 200, "application/json")
        : respondWith({ status: 404, code: "RESOURCE_NOT_FOUND" }, 404, "application/problem+json")
    }
  })
  const body = {
    projectionId: id,
    seasonId: id,
    posterAssetId: id,
    asOf: "2026-09-12T00:00:00Z",
    factIds: [id]
  }
  const generated = await client.POST("/api/v1/publisher/season-recaps", { body })
  assert.equal(generated.data?.documentId, id)
  assert.deepEqual(await requests[0]?.json(), body)
  const privateRecap = await client.GET("/api/v1/me/seasons/{seasonId}/recaps/{projectionId}", {
    params: { path: { seasonId: id, projectionId: id } }
  })
  assert.equal(privateRecap.data, undefined)
  assert.equal(privateRecap.error?.code, "RESOURCE_NOT_FOUND")
  assert.equal(requests[1]?.url, `https://api.example.test/api/v1/me/seasons/${id}/recaps/${id}`)
})
