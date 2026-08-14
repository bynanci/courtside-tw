import { canonicalUrl, jsonLd } from "../../../composables/public-seo.ts"

type ArticleSeoContributor = {
  displayName: string
  role: string
}

export type ArticleSeoInput = {
  siteUrl: string
  slug: string
  canonicalPath?: string
  title: string
  description?: string
  contributors: ArticleSeoContributor[]
  publishedAt?: string
  modifiedAt?: string
  imageUrl?: string
}

type ArticleSeoMeta = { name: string; content: string } | { property: string; content: string }

type ArticleSeoResult = {
  title: string
  meta: ArticleSeoMeta[]
  link: Array<{ rel: "canonical"; href: string }>
  script: Array<{
    key: "courtside-article-jsonld"
    type: "application/ld+json"
    innerHTML: string
  }>
}

const DEFAULT_DESCRIPTION = "Courtside TW 的公開文章閱讀頁。"

export function buildArticleSeo(input: ArticleSeoInput): ArticleSeoResult {
  const safeSlug = publicSlug(input.slug)
  const canonical = canonicalUrl(input.siteUrl, publicArticlePath(input.canonicalPath, safeSlug))
  const pageTitle = normalizedText(input.title, 200) || "文章閱讀頁"
  const title = pageTitle + " — Courtside TW"
  const description = normalizedText(input.description, 500) || DEFAULT_DESCRIPTION
  const publishedAt = publicTimestamp(input.publishedAt)
  const modifiedAt = publicTimestamp(input.modifiedAt)
  const imageUrl = publicImageUrl(input.imageUrl)
  const authors = input.contributors
    .filter((contributor) => contributor.role === "AUTHOR")
    .map((contributor) => normalizedText(contributor.displayName, 160))
    .filter(Boolean)
    .map((name) => ({ "@type": "Person", name }))
  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: pageTitle,
    description,
    url: canonical,
    inLanguage: "zh-Hant-TW"
  }
  if (authors.length > 0) {
    structuredData.author = authors
  }
  if (publishedAt) {
    structuredData.datePublished = publishedAt
  }
  if (modifiedAt) {
    structuredData.dateModified = modifiedAt
  }
  if (imageUrl) {
    structuredData.image = imageUrl
  }

  const meta: ArticleSeoMeta[] = [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: canonical }
  ]
  if (publishedAt) {
    meta.push({ property: "article:published_time", content: publishedAt })
  }
  if (modifiedAt) {
    meta.push({ property: "article:modified_time", content: modifiedAt })
  }
  if (imageUrl) {
    meta.push({ property: "og:image", content: imageUrl })
  }

  return {
    title,
    meta,
    link: [{ rel: "canonical", href: canonical }],
    script: [
      {
        key: "courtside-article-jsonld",
        type: "application/ld+json",
        innerHTML: jsonLd(structuredData)
      }
    ]
  }
}

function publicSlug(value: string): string {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) ? value : "not-found"
}

function publicArticlePath(value: unknown, safeSlug: string): string {
  const expectedPath = "/articles/" + safeSlug
  return typeof value === "string" && value === expectedPath ? value : expectedPath
}

function normalizedText(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? replaceControlCharacters(value).replace(/\s+/gu, " ").trim().slice(0, maximumLength)
    : ""
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f ? " " : character
  }).join("")
}

function publicTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) {
    return null
  }
  const instant = Date.parse(value)
  return Number.isFinite(instant) ? new Date(instant).toISOString().replace(".000Z", "Z") : null
}

function publicImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) {
    return null
  }
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString()
      : null
  } catch {
    return null
  }
}
