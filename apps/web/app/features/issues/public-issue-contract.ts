const PUBLIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAXIMUM_SLUG_LENGTH = 128

export function parsePublicIssueSlug(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAXIMUM_SLUG_LENGTH ||
    !PUBLIC_SLUG.test(value)
  ) {
    throw new Error("public issue slug must be a bounded lowercase slug")
  }
  return value
}

export function parsePublicArticleSlug(value: string): string {
  try {
    return parsePublicIssueSlug(value)
  } catch {
    throw new Error("public article slug must be a bounded lowercase slug")
  }
}

export function issueRoute(issueSlug: string): string {
  return "/issues/" + parsePublicIssueSlug(issueSlug)
}

export function articleRoute(articleSlug: string, issueSlug: string): string {
  const article = parsePublicArticleSlug(articleSlug)
  const issue = parsePublicIssueSlug(issueSlug)
  return "/articles/" + article + "?issue=" + issue
}

export function publicIssueApiPath(issueSlug: string): string {
  return "/api/v1/public/issues/" + parsePublicIssueSlug(issueSlug)
}
