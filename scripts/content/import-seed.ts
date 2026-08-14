import { readFile } from "node:fs/promises"
import process from "node:process"

import { assertValidContentDocument } from "../../packages/content-schema/src/index.ts"

type SeedManifest = {
  fixtureVersion: number
  issue: {
    slug: string
    issueNumber: number
    articleCount: number
  }
  sections: Array<{
    position: number
    articles: Array<{ slug: string; position: number; contentFile: string }>
  }>
  rightsCases: Array<{
    id: string
    status: string
    allowedChannels: string[]
    validUntil: string
    expectedDecision: string
  }>
}

const manifestUrl = new URL(
  "../../apps/api/src/test/resources/fixtures/first-issue/manifest.json",
  import.meta.url
)
const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as SeedManifest
const sourceSections = manifest.sections
const positions = sourceSections.map((section) => section.position)
const articles = [...sourceSections]
  .sort((left, right) => left.position - right.position)
  .flatMap((section) => section.articles)
const slugs = new Set(articles.map((article) => article.slug))

function parseStrictUtcTimestamp(value: string, label: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/u.exec(value)
  if (!match) {
    throw new Error(`invalid ${label}: ${value}`)
  }

  const timestamp = Date.parse(value)
  const date = new Date(timestamp)
  const expected = match.slice(1).map(Number)
  const actual = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  ]
  if (!Number.isFinite(timestamp) || actual.some((part, index) => part !== expected[index])) {
    throw new Error(`invalid ${label}: ${value}`)
  }

  return timestamp
}

const checkedAt = parseStrictUtcTimestamp("2026-08-01T00:00:00Z", "checkedAt")
function deriveRightsDecision(rights: SeedManifest["rightsCases"][number]): string {
  const validUntil = parseStrictUtcTimestamp(rights.validUntil, `rights validUntil for ${rights.id}`)

  if (rights.status === "REVOKED") {
    return "RIGHTS_REVOKED"
  }
  if (rights.status === "EXPIRED") {
    return "RIGHTS_EXPIRED"
  }
  if (rights.status !== "VALID") {
    return "RIGHTS_MISSING"
  }
  if (validUntil <= checkedAt) {
    return "RIGHTS_EXPIRED"
  }
  if (!rights.allowedChannels.includes("PUBLIC_WEB")) {
    return "RIGHTS_WRONG_CHANNEL"
  }
  return "ALLOW"
}

const rightsDecisions = manifest.rightsCases.map((rights) => ({
  ...rights,
  decision: deriveRightsDecision(rights)
}))

if (
  manifest.fixtureVersion !== 1 ||
  !/^issue-\d{4}-\d{2}$/u.test(manifest.issue.slug) ||
  manifest.issue.issueNumber !== 1 ||
  manifest.issue.articleCount !== articles.length ||
  positions.some((position, index) => position !== index + 1) ||
  slugs.size !== articles.length ||
  rightsDecisions.length < 2 ||
  rightsDecisions.some((rights) => rights.expectedDecision !== rights.decision) ||
  !rightsDecisions.some((rights) => rights.decision === "ALLOW") ||
  !rightsDecisions.some((rights) => rights.decision === "RIGHTS_EXPIRED")
) {
  throw new Error("first-issue seed manifest is incomplete, non-deterministic, or rights-invalid")
}

const seedRoot = new URL(
  "../../apps/api/src/test/resources/fixtures/first-issue/",
  import.meta.url
)
for (const article of articles) {
  const content = JSON.parse(await readFile(new URL(article.contentFile, seedRoot), "utf8")) as unknown
  try {
    assertValidContentDocument(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid ContentDocument seed: ${article.slug}: ${message}`)
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "dry-run",
      issue: manifest.issue,
      sections: sourceSections.map((section) => ({
        position: section.position,
        articleSlugs: section.articles.map((article) => article.slug)
      })),
      rightsCases: rightsDecisions.map((rights) => ({
        id: rights.id,
        decision: rights.decision
      }))
    },
    null,
    2
  )}\n`
)
