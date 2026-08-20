import { gzipSync } from "node:zlib"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

const P5_INCREMENTAL_GZIP_BUDGET_BYTES = 450 * 1024
const ORDINARY_ARTICLE_HINTED_GZIP_BUDGET_BYTES = 400 * 1024
const TOTAL_CLIENT_JAVASCRIPT_GZIP_BUDGET_BYTES = 1600 * 1024
const assetDirectory = fileURLToPath(new URL("../.output/public/_nuxt/", import.meta.url))
const artifactDirectory = fileURLToPath(new URL("../../../artifacts/performance/", import.meta.url))

if (!existsSync(assetDirectory)) {
  throw new Error("Nuxt production output is missing; run the web build before bundle verification")
}

const chunks = readdirSync(assetDirectory)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => {
    const source = readFileSync(join(assetDirectory, fileName), "utf8")
    return {
      fileName,
      source,
      gzipBytes: gzipSync(source).byteLength
    }
  })
const chunksByName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
const p5Chunks = chunks.filter(
  ({ source }) =>
    source.includes("courtside-p5-core-color-shape") && source.includes("createCanvas")
)

if (p5Chunks.length !== 1) {
  throw new Error(`Expected one isolated p5 implementation chunk, found ${p5Chunks.length}`)
}

const p5Chunk = p5Chunks[0]
const referringChunks = chunks.filter(
  ({ fileName, source }) => fileName !== p5Chunk.fileName && source.includes(p5Chunk.fileName)
)
if (referringChunks.length === 0) {
  throw new Error("No trusted creative host dynamically references the isolated p5 chunk")
}

for (const chunk of referringChunks) {
  if (!hasDynamicImport(chunk.source, p5Chunk.fileName)) {
    throw new Error(`${chunk.fileName} must reference ${p5Chunk.fileName} only through import()`)
  }
}

const dynamicDependencyNames = new Set(
  referringChunks
    .flatMap(({ source }) => dynamicImports(source))
    .filter((fileName) => fileName !== p5Chunk.fileName)
)
const presetChunks = chunks.filter(({ fileName }) => dynamicDependencyNames.has(fileName))
if (presetChunks.length === 0) {
  throw new Error("The trusted creative host must keep its local preset in a lazy chunk")
}

const incrementalChunks = uniqueChunks([p5Chunk, ...referringChunks, ...presetChunks])
const incrementalGzipBytes = incrementalChunks.reduce((total, chunk) => total + chunk.gzipBytes, 0)
if (incrementalGzipBytes > P5_INCREMENTAL_GZIP_BUDGET_BYTES) {
  throw new Error(
    `p5 host and preset cost ${incrementalGzipBytes} gzip bytes; budget is ${P5_INCREMENTAL_GZIP_BUDGET_BYTES}`
  )
}

const precomputedPath = fileURLToPath(
  new URL("../.output/server/chunks/virtual/precomputed.mjs", import.meta.url)
)
if (!existsSync(precomputedPath)) {
  throw new Error("Nuxt server dependency graph is missing from the production build")
}
const { default: precomputed } = await import(
  new URL("../.output/server/chunks/virtual/precomputed.mjs", import.meta.url)
)
const articleDependencies = precomputed.dependencies?.["pages/articles/[articleSlug].vue"]
const serverHintedFiles = Object.values(articleDependencies?.prefetch ?? {}).map(
  (resource) => resource.file
)
for (const lazyChunk of [p5Chunk, ...presetChunks]) {
  if (serverHintedFiles.includes(lazyChunk.fileName)) {
    throw new Error(`Article SSR must not prefetch creative chunk ${lazyChunk.fileName}`)
  }
}

const hintedJavaScriptChunks = uniqueChunks(
  serverHintedFiles.flatMap((fileName) => {
    const chunk = chunksByName.get(fileName) ?? chunksByName.get(basename(fileName))
    return chunk ? [chunk] : []
  })
)
if (hintedJavaScriptChunks.length === 0) {
  throw new Error("Article SSR must expose a measurable ordinary-route JavaScript dependency set")
}
const ordinaryArticleHintedGzipBytes = hintedJavaScriptChunks.reduce(
  (total, chunk) => total + chunk.gzipBytes,
  0
)
if (ordinaryArticleHintedGzipBytes > ORDINARY_ARTICLE_HINTED_GZIP_BUDGET_BYTES) {
  throw new Error(
    `ordinary article hinted JavaScript costs ${ordinaryArticleHintedGzipBytes} gzip bytes; budget is ${ORDINARY_ARTICLE_HINTED_GZIP_BUDGET_BYTES}`
  )
}

const totalClientJavaScriptGzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0)
if (totalClientJavaScriptGzipBytes > TOTAL_CLIENT_JAVASCRIPT_GZIP_BUDGET_BYTES) {
  throw new Error(
    `total client JavaScript costs ${totalClientJavaScriptGzipBytes} gzip bytes; budget is ${TOTAL_CLIENT_JAVASCRIPT_GZIP_BUDGET_BYTES}`
  )
}

const result = {
  result: "PASS",
  p5Chunk: p5Chunk.fileName,
  p5ChunkGzipBytes: p5Chunk.gzipBytes,
  dynamicHosts: referringChunks.map(({ fileName, gzipBytes }) => ({ fileName, gzipBytes })),
  presetChunks: presetChunks.map(({ fileName, gzipBytes }) => ({ fileName, gzipBytes })),
  serverResourceHints: serverHintedFiles,
  ordinaryArticleHintedChunks: hintedJavaScriptChunks.map(({ fileName, gzipBytes }) => ({
    fileName,
    gzipBytes
  })),
  ordinaryArticleHintedGzipBytes,
  ordinaryArticleHintedGzipBudgetBytes: ORDINARY_ARTICLE_HINTED_GZIP_BUDGET_BYTES,
  incrementalGzipBytes,
  incrementalGzipBudgetBytes: P5_INCREMENTAL_GZIP_BUDGET_BYTES,
  totalClientJavaScriptChunks: chunks.length,
  totalClientJavaScriptGzipBytes,
  totalClientJavaScriptGzipBudgetBytes: TOTAL_CLIENT_JAVASCRIPT_GZIP_BUDGET_BYTES,
  ordinaryRouteTransferGate: "tests/performance/public-read.js"
}

mkdirSync(artifactDirectory, { recursive: true })
writeFileSync(
  join(artifactDirectory, "bundle-budget.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8"
)
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

function hasDynamicImport(source, fileName) {
  return ["`", "'", '"'].some((quote) => source.includes(`import(${quote}./${fileName}${quote})`))
}

function dynamicImports(source) {
  return Array.from(
    source.matchAll(/import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/gu),
    (match) => match[1]
  ).filter(Boolean)
}

function uniqueChunks(values) {
  return Array.from(new Map(values.map((chunk) => [chunk.fileName, chunk])).values())
}
