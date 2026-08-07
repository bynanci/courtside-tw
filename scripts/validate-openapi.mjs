import assert from "node:assert/strict"
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
  "/api/v1/public/issues": ["get"],
  "/api/v1/public/issues/{issueSlug}": ["get"],
  "/api/v1/public/articles/{articleSlug}": ["get"],
  "/api/v1/public/search": ["get"],
  "/api/v1/public/taxonomy/{type}": ["get"],
  "/api/v1/public/withdrawals": ["get"],
  "/api/v1/public/issues/{issueSlug}/provenance": ["get"],
  "/api/v1/public/offline/issues/{issueSlug}/manifest": ["get"],
  "/api/v1/me/bookmarks": ["get"],
  "/api/v1/me/bookmarks/{articleId}": ["put", "delete"],
  "/api/v1/me/progress": ["get"],
  "/api/v1/me/progress/{articleId}": ["put"],
  "/api/v1/me/progress:merge": ["post"],
  "/api/v1/auth/siwe/challenge": ["post"],
  "/api/v1/auth/siwe/verify": ["post"],
  "/api/v1/me/wallets/{chainNamespace}/{address}": ["delete"],
  "/api/v1/me": ["delete"],
  "/api/v1/editor/issues": ["post", "get", "patch"],
  "/api/v1/editor/articles": ["post", "get", "patch"],
  "/api/v1/editor/articles/{id}:submit": ["post"],
  "/api/v1/publisher/articles/{id}:approve": ["post"],
  "/api/v1/publisher/issues/{id}:publish": ["post"],
  "/api/v1/publisher/issues/{id}:schedule": ["post"],
  "/api/v1/publisher/articles/{id}:withdraw": ["post"],
  "/api/v1/editor/media/uploads": ["post"],
  "/api/v1/editor/media/{id}:complete": ["post"],
  "/api/v1/publisher/media/{id}:revoke": ["post"],
  "/api/v1/editor/taxonomy": ["post", "get", "patch"]
}

const expectedErrorStatuses = [400, 401, 403, 404, 409, 422, 429]
const stableCodes = {
  400: "INVALID_REQUEST",
  401: "AUTHENTICATION_REQUIRED",
  403: "FORBIDDEN",
  404: "RESOURCE_NOT_FOUND",
  409: "VERSION_CONFLICT",
  422: "RIGHTS_OR_CONTENT_GATE",
  429: "RATE_LIMITED"
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
  assert.ok(
    operation.summary && operation.description,
    `summary/description missing for ${operation.operationId}`
  )
  assert.ok(
    operation.responses && Object.keys(operation.responses).length >= 2,
    `responses missing for ${operation.operationId}`
  )

  const names = new Set((operation.parameters ?? []).map(parameterName))
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
        const media = response.content["application/json"]
        assert.ok(media?.schema, `success schema missing for ${operation.operationId}`)
        assert.ok(
          media.examples && Object.keys(media.examples).length > 0,
          `success example missing for ${operation.operationId}`
        )
      }
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
  ["get", "/api/v1/editor/articles"],
  ["get", "/api/v1/editor/taxonomy"]
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

console.log(
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
  )
)
