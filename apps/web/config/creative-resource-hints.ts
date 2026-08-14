type ClientManifestEntry = {
  dynamicImports?: string[]
}

type ClientManifest = Record<string, ClientManifestEntry>

const ARTICLE_ROUTE_MODULE_ID = "pages/articles/[articleSlug].vue"

export function removeCreativeRuntimePrefetch(manifest: ClientManifest): void {
  const articleEntry = manifest[ARTICLE_ROUTE_MODULE_ID]
  if (!articleEntry?.dynamicImports) {
    return
  }
  articleEntry.dynamicImports = articleEntry.dynamicImports.filter((moduleId) => {
    const normalizedId = moduleId.replaceAll("\\", "/")
    return !(
      normalizedId.includes("/node_modules/p5/") ||
      normalizedId.includes("/node_modules/.pnpm/p5@") ||
      normalizedId.endsWith("/creative-runtime/src/presets/court-pulse-v1.ts")
    )
  })
}
