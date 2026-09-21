import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const openapiPath = path.join(root, "contracts/openapi.yaml")
const contentSchemaPath = path.join(root, "contracts/content-document.schema.json")
const document = parse(fs.readFileSync(openapiPath, "utf8"))
const components = document.components
const paths = document.paths
const operations = []

const expectedPaths = {
  "/api/v1/publisher/basketball/snapshots": ["post"],
  "/api/v1/publisher/basketball/evidence/{evidenceId}:confirm": ["post"],
  "/api/v1/publisher/basketball/facts": ["post"],
  "/api/v1/publisher/basketball/evidence/{evidenceId}": ["get"],
  "/api/v1/admin/basketball/snapshots": ["post"],
  "/api/v1/admin/basketball/evidence/{evidenceId}:confirm": ["post"],
  "/api/v1/admin/basketball/facts": ["post"],
  "/api/v1/admin/basketball/evidence/{evidenceId}": ["get"],
  "/api/v1/publisher/season-recaps": ["post"],
  "/api/v1/public/seasons/{seasonId}/recaps/{projectionId}": ["get"],
  "/api/v1/me/seasons/{seasonId}/recaps/{projectionId}": ["get"],
  "/api/v1/me/passport": ["get"],
  "/api/v1/me/passport/claims": ["post"],
  "/api/v1/me/passport/{stampId}/credential": ["post"],
  "/api/v1/publisher/passport/{stampId}/status": ["post"],
  "/api/v1/public/issues": ["get"],
  "/api/v1/public/issues/{issueSlug}": ["get"],
  "/api/v1/public/articles/{articleSlug}": ["get"],
  "/api/v1/public/search": ["get"],
  "/api/v1/public/taxonomy/{type}": ["get"],
  "/api/v1/public/withdrawals": ["get"],
  "/api/v1/public/issues/{issueSlug}/provenance": ["get"],
  "/api/v1/public/offline/issues/{issueSlug}/manifest": ["get"],
  "/api/v1/public/offline/issues/{issueSlug}/articles/{articleId}/revisions/{revisionId}": ["get"],
  "/api/v1/me/bookmarks": ["get"],
  "/api/v1/me/bookmarks/{articleId}": ["put", "delete"],
  "/api/v1/me/progress": ["get"],
  "/api/v1/me/progress/{articleId}": ["put"],
  "/api/v1/me/progress:merge": ["post"],
  "/api/v1/me/export": ["get"],
  "/api/v1/auth/siwe/challenge": ["post"],
  "/api/v1/auth/siwe/verify": ["post"],
  "/api/v1/me/wallets/{chainNamespace}/{address}": ["delete"],
  "/api/v1/me": ["delete"],
  "/api/v1/editor/issues": ["post", "get", "patch"],
  "/api/v1/editor/issues/{issueId}:submit": ["post"],
  "/api/v1/editor/issues/{issueId}/sections": ["get", "post", "patch"],
  "/api/v1/editor/issues/{issueId}/articles": ["get", "put"],
  "/api/v1/publisher/issues/{issueId}/articles": ["get"],
  "/api/v1/editor/issues/{issueId}/sections/{sectionId}": ["patch", "delete"],
  "/api/v1/editor/articles": ["post", "get", "patch"],
  "/api/v1/editor/articles/{id}": ["get"],
  "/api/v1/editor/articles/{id}:revise": ["post"],
  "/api/v1/editor/articles/{id}:submit": ["post"],
  "/api/v1/publisher/articles": ["get"],
  "/api/v1/publisher/articles/{id}": ["get"],
  "/api/v1/publisher/articles/{id}:approve": ["post"],
  "/api/v1/publisher/articles/{id}:schedule": ["post"],
  "/api/v1/publisher/articles/{id}:publish": ["post"],
  "/api/v1/publisher/articles/{id}:request-changes": ["post"],
  "/api/v1/publisher/issues": ["get"],
  "/api/v1/publisher/issues/{id}": ["get"],
  "/api/v1/publisher/issues/{id}:publish": ["post"],
  "/api/v1/publisher/issues/{id}:approve": ["post"],
  "/api/v1/publisher/issues/{id}:schedule": ["post"],
  "/api/v1/publisher/issues/{id}:archive": ["post"],
  "/api/v1/publisher/articles/{id}:withdraw": ["post"],
  "/api/v1/publisher/articles/{id}:archive": ["post"],
  "/api/v1/editor/audit": ["get"],
  "/api/v1/editor/media/uploads": ["post"],
  "/api/v1/editor/media": ["get"],
  "/api/v1/publisher/media": ["get"],
  "/api/v1/editor/media/{id}:archive": ["post"],
  "/api/v1/publisher/media/{id}:archive": ["post"],
  "/api/v1/editor/media/{id}": ["get", "patch"],
  "/api/v1/editor/media/{id}/preview": ["get"],
  "/api/v1/publisher/media/{id}/preview": ["get"],
  "/api/v1/editor/media/{id}:complete": ["post"],
  "/api/v1/publisher/media/{id}:revoke": ["post"],
  "/api/v1/editor/taxonomy": ["post", "get"],
  "/api/v1/editor/taxonomy/{termId}": ["patch"],
  "/api/v1/editor/taxonomy/{termId}/aliases": ["post"],
  "/api/v1/editor/contributors": ["get", "post"],
  "/api/v1/editor/contributors/{contributorId}": ["get", "patch"],
  "/api/v1/editor/contributors/{contributorId}:archive": ["post"],
  "/api/v1/editor/articles/{articleId}/revisions/{revisionId}/contributors": ["get", "put"]
}

// Closed exceptions describe existing command semantics; omitted If-Match is never an implicit waiver.
const writeConcurrencyExceptions = {
  submitPublisherBasketballSnapshot: "IMMUTABLE_SOURCE_ID",
  confirmPublisherBasketballEvidence: "IMMUTABLE_EVIDENCE_ID",
  appendPublisherBasketballFact: "IMMUTABLE_FACT_ID",
  submitAdminBasketballSnapshot: "IMMUTABLE_SOURCE_ID",
  confirmAdminBasketballEvidence: "IMMUTABLE_EVIDENCE_ID",
  appendAdminBasketballFact: "IMMUTABLE_FACT_ID",
  generatePublisherSeasonRecap: "IMMUTABLE_PROJECTION_ID",
  claimReaderStamp: "IDEMPOTENCY_KEY",
  requestStampCredential: "IDEMPOTENCY_KEY",
  putBookmark: "IDEMPOTENT_SET",
  deleteBookmark: "IDEMPOTENT_SET",
  putReadingProgress: "REVISION_GUARDED_PROGRESS",
  mergeReadingProgress: "REVISION_GUARDED_MERGE",
  requestAccountDeletion: "IDEMPOTENCY_KEY",
  createEditorIssue: "IDEMPOTENCY_KEY",
  createEditorArticle: "IDEMPOTENCY_KEY",
  submitArticleForReview: "REVISION_ID_AND_IDEMPOTENCY_KEY",
  createMediaUploadIntent: "IDEMPOTENCY_KEY",
  completeMediaUpload: "IDEMPOTENCY_KEY",
  createManagedTaxonomy: "UNIQUE_KEY_CREATE",
  createEditorContributor: "IDEMPOTENCY_KEY",
  createSiweChallenge: "IDEMPOTENCY_KEY",
  verifySiweSignature: "SINGLE_USE_NONCE",
  revokeWalletLink: "IDEMPOTENT_SET"
}

const expectedErrorStatuses = [400, 401, 403, 404, 409, 422, 429]
const expectedConditionalStatuses = [304]
const stableCodes = {
  400: "INVALID_REQUEST",
  401: "AUTHENTICATION_REQUIRED",
  403: "FORBIDDEN",
  404: "RESOURCE_NOT_FOUND",
  409: "VERSION_CONFLICT",
  422: "RIGHTS_OR_CONTENT_GATE",
  429: "RATE_LIMITED"
}
// Provider unavailability belongs only to these binary reads; other APIs retain
// the existing closed error status catalog and stable Problem responses.
const privatePreviewOperations = new Map([
  ["getPrivateMediaPreview", { path: "/api/v1/editor/media/{id}/preview", role: "EDITOR" }],
  [
    "getPublisherPrivateMediaPreview",
    { path: "/api/v1/publisher/media/{id}/preview", role: "PUBLISHER" }
  ]
])

const assertPrivateResponseHeaders = (response, operationId) => {
  assert.equal(
    response.headers?.["X-Request-Id"]?.$ref,
    "#/components/headers/XRequestId",
    `private request ID header missing for ${operationId}`
  )
  assert.equal(
    response.headers?.["Cache-Control"]?.schema?.const,
    "no-store, private",
    `private no-store header missing for ${operationId}`
  )
  assert.equal(
    response.headers?.["X-Content-Type-Options"]?.schema?.const,
    "nosniff",
    `private nosniff header missing for ${operationId}`
  )
}

assert.equal(document.openapi, "3.1.0", "OpenAPI 3.1 is required")
assert.equal(document.info?.version, "1.0.0", "contract version must be 1.0.0")
assert.ok(document.info?.title, "API title is required")
assert.equal(
  document.jsonSchemaDialect,
  "https://json-schema.org/draft/2020-12/schema",
  "draft 2020-12 dialect must be explicit"
)
assert.ok(fs.existsSync(contentSchemaPath), "canonical ContentDocument schema is missing")
const contentSchema = JSON.parse(fs.readFileSync(contentSchemaPath, "utf8"))
assert.equal(contentSchema.$id, "https://courtside.tw/contracts/content-document.schema.json")
assert.equal(components.schemas.ContentDocument.$ref, "./content-document.schema.json")

assert.ok(components.securitySchemes.oidcBearer, "OIDC bearer scheme is required")
assert.equal(components.securitySchemes.oidcBearer.type, "http")
assert.equal(components.securitySchemes.oidcBearer.scheme, "bearer")
assert.ok(components.securitySchemes.bffSession, "BFF session scheme is required")
assert.equal(components.securitySchemes.bffSession.in, "cookie")
assert.match(components.securitySchemes.bffSession.name, /^__Host-/)

for (const [pathName, methods] of Object.entries(expectedPaths)) {
  assert.ok(paths[pathName], `missing path ${pathName}`)
  for (const method of methods) {
    assert.ok(paths[pathName][method], `missing operation ${method.toUpperCase()} ${pathName}`)
  }
}
for (const pathName of Object.keys(paths)) {
  for (const [method, operation] of Object.entries(paths[pathName])) {
    if (!["get", "post", "put", "patch", "delete", "head", "options", "trace"].includes(method))
      continue
    operations.push({ pathName, method, operation })
  }
}
assert.equal(
  operations.length,
  Object.values(expectedPaths).reduce((total, methods) => total + methods.length, 0),
  "unexpected operation count"
)

const operationIds = new Set()
const seenStatuses = new Set()
const parameterName = (parameter) => {
  if (parameter?.$ref?.startsWith("#/components/parameters/")) {
    return components.parameters[parameter.$ref.split("/").pop()]?.name
  }
  return parameter?.name
}
const responseRefName = (response) =>
  response?.$ref?.startsWith("#/components/responses/") ? response.$ref.split("/").pop() : null

for (const { pathName, method, operation } of operations) {
  assert.ok(operation.operationId, `operationId missing for ${method} ${pathName}`)
  assert.ok(
    !operationIds.has(operation.operationId),
    `duplicate operationId ${operation.operationId}`
  )
  operationIds.add(operation.operationId)
  const privatePreview = privatePreviewOperations.get(operation.operationId)
  if (privatePreview) {
    assert.equal(pathName, privatePreview.path, "private preview exception must remain path-bound")
    assert.equal(method, "get")
    assert.deepEqual(operation["x-required-roles"], [privatePreview.role])
    assert.ok(
      operation.responses?.[200]?.content,
      `binary response missing for ${operation.operationId}`
    )
    assert.ok(
      operation.responses?.[422],
      `media readiness response missing for ${operation.operationId}`
    )
    assert.ok(
      operation.responses?.[503],
      `provider unavailable response missing for ${operation.operationId}`
    )
  }
  assert.ok(
    operation.summary && operation.description,
    `summary/description missing for ${operation.operationId}`
  )
  assert.ok(
    operation.responses && Object.keys(operation.responses).length >= 2,
    `responses missing for ${operation.operationId}`
  )

  const names = new Set([
    ...(paths[pathName].parameters ?? []).map(parameterName),
    ...(operation.parameters ?? []).map(parameterName)
  ])
  for (const match of pathName.matchAll(/\{([^}]+)\}/g)) {
    assert.ok(
      names.has(match[1]),
      `path parameter ${match[1]} missing for ${operation.operationId}`
    )
  }
  if (operation["x-idempotent"]) {
    assert.ok(names.has("Idempotency-Key"), `Idempotency-Key missing for ${operation.operationId}`)
  }
  if (operation["x-optimistic-lock"]) {
    assert.ok(names.has("If-Match"), `If-Match missing for ${operation.operationId}`)
  }
  if (["post", "put", "patch", "delete"].includes(method)) {
    const concurrency = writeConcurrencyExceptions[operation.operationId] ?? "IF_MATCH"
    assert.equal(
      operation["x-write-concurrency"],
      concurrency,
      `explicit write concurrency missing for ${operation.operationId}`
    )
    if (concurrency === "IF_MATCH") {
      assert.equal(
        operation["x-optimistic-lock"],
        "If-Match",
        `mutable resource lock missing for ${operation.operationId}`
      )
      assert.ok(
        operation.responses[409],
        `version conflict response missing for ${operation.operationId}`
      )
    }
    if (concurrency.includes("IDEMPOTENCY_KEY")) {
      assert.equal(operation["x-idempotent"], true)
      assert.ok(names.has("Idempotency-Key"))
    }
    if (concurrency !== "PLANNED_US7") {
      for (const status of [400, 401, 403, 429]) {
        assert.equal(
          responseRefName(operation.responses[status]),
          `Problem${status}`,
          `write error ${status} missing for ${operation.operationId}`
        )
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (Number(status) >= 200 && Number(status) < 300) {
          assert.equal(
            response.headers?.["X-Request-Id"]?.$ref,
            "#/components/headers/XRequestId",
            `write request ID header missing for ${operation.operationId}`
          )
        }
      }
    }
  }
  if (operation.requestBody) {
    const media = operation.requestBody.content?.["application/json"]
    assert.ok(media?.schema, `request schema missing for ${operation.operationId}`)
    assert.ok(
      media.examples && Object.keys(media.examples).length > 0,
      `request example missing for ${operation.operationId}`
    )
  }

  for (const [status, response] of Object.entries(operation.responses)) {
    const numericStatus = Number(status)
    if (numericStatus >= 200 && numericStatus < 300) {
      seenStatuses.add(numericStatus)
      if (response.content) {
        if (privatePreview) {
          assert.equal(numericStatus, 200)
          assertPrivateResponseHeaders(response, operation.operationId)
          assert.deepEqual(Object.keys(response.content).sort(), [
            "image/avif",
            "image/jpeg",
            "image/png",
            "image/webp"
          ])
          for (const media of Object.values(response.content)) {
            assert.equal(media.schema?.type, "string")
            assert.equal(media.schema?.format, "binary")
          }
          continue
        }
        const media = response.content["application/json"]
        assert.ok(media?.schema, `success schema missing for ${operation.operationId}`)
        assert.ok(
          media.examples && Object.keys(media.examples).length > 0,
          `success example missing for ${operation.operationId}`
        )
      }
      continue
    }
    if (expectedConditionalStatuses.includes(numericStatus)) {
      assert.equal(
        response.content,
        undefined,
        "conditional response must not carry a representation for " + operation.operationId
      )
      continue
    }
    if (numericStatus === 503 && privatePreview) {
      assert.equal(
        responseRefName(response),
        "PrivateMediaPreviewUnavailable",
        `preview unavailable response mismatch for ${operation.operationId}`
      )
      continue
    }
    assert.ok(
      expectedErrorStatuses.includes(numericStatus),
      `unstable error status ${status} in ${operation.operationId}`
    )
    const name = responseRefName(response)
    assert.equal(
      name,
      `Problem${status}`,
      `error ${status} must use the stable Problem${status} response`
    )
    assert.ok(components.responses[name], `missing response component ${name}`)
    seenStatuses.add(numericStatus)
  }
}
for (const operationId of privatePreviewOperations.keys()) {
  assert.ok(operationIds.has(operationId), `private preview operation missing: ${operationId}`)
}
const previewUnavailable = components.responses.PrivateMediaPreviewUnavailable
assertPrivateResponseHeaders(previewUnavailable, "PrivateMediaPreviewUnavailable")
assert.equal(
  previewUnavailable.content?.["application/problem+json"]?.schema?.$ref,
  "#/components/schemas/ProblemDetails"
)
assert.equal(previewUnavailable["x-stable-error-code"], "MEDIA_PREVIEW_UNAVAILABLE")
assert.deepEqual(
  previewUnavailable.content["application/problem+json"].examples?.unavailable?.value,
  {
    type: "https://courtside.tw/problems/media_preview_unavailable",
    title: "Media preview unavailable",
    status: 503,
    detail: "Private media preview is temporarily unavailable.",
    instance: "/api/v1/editor/media/00000000-0000-4000-8000-000000000001/preview",
    requestId: "req_private_preview_unavailable",
    code: "MEDIA_PREVIEW_UNAVAILABLE"
  }
)
assert.ok(
  components.schemas.ProblemDetails.properties.code.enum.includes("MEDIA_PREVIEW_UNAVAILABLE")
)
assertPrivateResponseHeaders(paths["/api/v1/editor/media"].get.responses[200], "listPrivateMedia")
assert.equal(
  paths["/api/v1/editor/media"].get.responses[200].content["application/json"].schema.$ref,
  "#/components/schemas/PrivateMediaPage"
)
for (const status of expectedErrorStatuses) {
  assert.ok(seenStatuses.has(status), `stable error status ${status} is not used`)
  const response = components.responses[`Problem${status}`]
  assert.ok(response, `Problem${status} component is missing`)
  const media = response.content?.["application/problem+json"]
  assert.ok(
    media?.schema?.$ref === "#/components/schemas/ProblemDetails",
    `Problem${status} schema mismatch`
  )
  const example = media.examples?.stable?.value
  assert.ok(example, `Problem${status} example is missing`)
  assert.equal(example.status, status)
  assert.equal(example.code, stableCodes[status])
  assert.equal(response["x-stable-error-code"], stableCodes[status])
}
assert.deepEqual(
  document["x-contract-rules"].stableErrorStatuses,
  expectedErrorStatuses,
  "stable error status catalog drifted"
)

const paginated = [
  ["get", "/api/v1/public/issues"],
  ["get", "/api/v1/public/search"],
  ["get", "/api/v1/public/taxonomy/{type}"],
  ["get", "/api/v1/me/bookmarks"],
  ["get", "/api/v1/me/progress"],
  ["get", "/api/v1/editor/issues"],
  ["get", "/api/v1/publisher/issues"],
  ["get", "/api/v1/editor/articles"],
  ["get", "/api/v1/editor/media"]
]
for (const [method, pathName] of paginated) {
  const operation = paths[pathName][method]
  const names = new Set((operation.parameters ?? []).map(parameterName))
  assert.ok(
    names.has("cursor") && names.has("limit"),
    `cursor pagination missing for ${method.toUpperCase()} ${pathName}`
  )
}
assert.ok(
  components.schemas.PageMeta.properties.nextCursor,
  "nextCursor is required for cursor pagination"
)
assert.ok(components.parameters.IdempotencyKey, "Idempotency-Key parameter is required")
assert.ok(components.parameters.IfMatch, "If-Match parameter is required")

const optimisticLockTargets = [
  ["patch", "/api/v1/editor/issues"],
  ["patch", "/api/v1/editor/articles"],
  ["post", "/api/v1/publisher/articles/{id}:approve"],
  ["post", "/api/v1/publisher/issues/{id}:publish"],
  ["post", "/api/v1/publisher/issues/{id}:schedule"],
  ["post", "/api/v1/publisher/articles/{id}:withdraw"],
  ["post", "/api/v1/publisher/media/{id}:revoke"]
]
for (const [method, pathName] of optimisticLockTargets) {
  assert.equal(
    paths[pathName][method]["x-optimistic-lock"],
    "If-Match",
    `If-Match missing for ${method.toUpperCase()} ${pathName}`
  )
}

const implementedIntakeAndRecap = {
  "/api/v1/publisher/basketball/snapshots": {
    method: "post",
    operationId: "submitPublisherBasketballSnapshot",
    roles: ["PUBLISHER"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["201", "400", "401", "403", "409", "429"],
    concurrency: "IMMUTABLE_SOURCE_ID"
  },
  "/api/v1/publisher/basketball/evidence/{evidenceId}:confirm": {
    method: "post",
    operationId: "confirmPublisherBasketballEvidence",
    roles: ["PUBLISHER"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["201", "400", "401", "403", "409", "429"],
    concurrency: "IMMUTABLE_EVIDENCE_ID"
  },
  "/api/v1/publisher/basketball/facts": {
    method: "post",
    operationId: "appendPublisherBasketballFact",
    roles: ["PUBLISHER"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["201", "400", "401", "403", "409", "429"],
    concurrency: "IMMUTABLE_FACT_ID"
  },
  "/api/v1/publisher/basketball/evidence/{evidenceId}": {
    method: "get",
    operationId: "getPublisherBasketballEvidence",
    roles: ["PUBLISHER"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["200", "400", "401", "403", "409", "429"],
    concurrency: null
  },
  "/api/v1/admin/basketball/snapshots": {
    method: "post",
    operationId: "submitAdminBasketballSnapshot",
    roles: ["ADMIN"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["201", "400", "401", "403", "409", "429"],
    concurrency: "IMMUTABLE_SOURCE_ID"
  },
  "/api/v1/admin/basketball/evidence/{evidenceId}:confirm": {
    method: "post",
    operationId: "confirmAdminBasketballEvidence",
    roles: ["ADMIN"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["201", "400", "401", "403", "409", "429"],
    concurrency: "IMMUTABLE_EVIDENCE_ID"
  },
  "/api/v1/admin/basketball/facts": {
    method: "post",
    operationId: "appendAdminBasketballFact",
    roles: ["ADMIN"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["201", "400", "401", "403", "409", "429"],
    concurrency: "IMMUTABLE_FACT_ID"
  },
  "/api/v1/admin/basketball/evidence/{evidenceId}": {
    method: "get",
    operationId: "getAdminBasketballEvidence",
    roles: ["ADMIN"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["200", "400", "401", "403", "409", "429"],
    concurrency: null
  },
  "/api/v1/publisher/season-recaps": {
    method: "post",
    operationId: "generatePublisherSeasonRecap",
    roles: ["PUBLISHER"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["200", "400", "401", "403", "422", "429"],
    concurrency: "IMMUTABLE_PROJECTION_ID"
  },
  "/api/v1/public/seasons/{seasonId}/recaps/{projectionId}": {
    method: "get",
    operationId: "getPublishedSeasonRecap",
    roles: [],
    security: [],
    statuses: ["200", "400", "404", "422", "429"],
    concurrency: null
  },
  "/api/v1/me/seasons/{seasonId}/recaps/{projectionId}": {
    method: "get",
    operationId: "getPrivateSeasonRecapBoundary",
    roles: ["READER"],
    security: [
      {
        oidcBearer: []
      }
    ],
    statuses: ["401", "403", "404"],
    concurrency: null
  }
}
for (const [pathName, expected] of Object.entries(implementedIntakeAndRecap)) {
  const operation = paths[pathName]?.[expected.method]
  assert.equal(
    operation?.operationId,
    expected.operationId,
    "implemented operation identity drifted"
  )
  assert.deepEqual(
    operation["x-required-roles"] ?? [],
    expected.roles,
    "implemented role boundary drifted"
  )
  assert.deepEqual(
    operation.security,
    expected.security,
    "implemented authentication boundary drifted"
  )
  assert.deepEqual(
    Object.keys(operation.responses).sort(),
    [...expected.statuses].sort(),
    "implemented response inventory drifted"
  )
  assert.equal(
    operation["x-write-concurrency"] ?? null,
    expected.concurrency,
    "immutable identity concurrency drifted"
  )
  if (expected.concurrency) {
    assert.equal(
      operation["x-idempotent"],
      undefined,
      "UUID identity must not claim an unimplemented idempotency header"
    )
    assert.equal(
      operation["x-optimistic-lock"],
      undefined,
      "immutable identity must not claim If-Match support"
    )
  }
}

execFileSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test/extended-openapi-contracts.test.mjs")],
  { stdio: "inherit" }
)

process.stdout.write(
  JSON.stringify(
    {
      openapi: document.openapi,
      paths: Object.keys(expectedPaths).length,
      operations: operations.length,
      stable_error_statuses: expectedErrorStatuses,
      request_examples: operations.filter(({ operation }) => operation.requestBody).length,
      result: "PASS"
    },
    null,
    2
  ) + "\n"
)
