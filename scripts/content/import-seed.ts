import { readFile } from "node:fs/promises"
import process from "node:process"

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

const articles = manifest.sections
  .sort((left, right) => left.position - right.position)
  .flatMap((section) => section.articles)
const slugs = new Set(articles.map((article) => article.slug))
const positions = manifest.sections.map((section) => section.position)

if (
  manifest.fixtureVersion !== 1 ||
  !/^issue-\d{4}-\d{2}$/u.test(manifest.issue.slug) ||
  manifest.issue.issueNumber !== 1 ||
  manifest.issue.articleCount !== articles.length ||
  positions.some((position, index) => position !== index + 1) ||
  slugs.size !== articles.length ||
  manifest.rightsCases.length < 2 ||
  !manifest.rightsCases.some((rights) => rights.expectedDecision === "ALLOW") ||
  !manifest.rightsCases.some((rights) => rights.expectedDecision === "RIGHTS_EXPIRED")
) {
  throw new Error("first-issue seed manifest is incomplete or non-deterministic")
}

const seedRoot = new URL(
  "../../apps/api/src/test/resources/fixtures/first-issue/",
  import.meta.url
)
for (const article of articles) {
  const content = JSON.parse(await readFile(new URL(article.contentFile, seedRoot), "utf8")) as {
    schemaVersion?: number
    blocks?: unknown[]
  }
  if (
    content.schemaVersion !== 1 ||
    !Array.isArray(content.blocks) ||
    content.blocks.length === 0
  ) {
    throw new Error(`invalid ContentDocument seed: ${article.slug}`)
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "dry-run",
      issue: manifest.issue,
      sections: manifest.sections.map((section) => ({
        position: section.position,
        articleSlugs: section.articles.map((article) => article.slug)
      })),
      rightsCases: manifest.rightsCases.map((rights) => ({
        id: rights.id,
        expectedDecision: rights.expectedDecision
      }))
    },
    null,
    2
  )}\n`
)
