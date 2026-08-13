import { gzipSync } from "node:zlib"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const P5_INCREMENTAL_GZIP_BUDGET_BYTES = 450 * 1024
const assetDirectory = fileURLToPath(new URL("../.output/public/_nuxt/", import.meta.url))

if (!existsSync(assetDirectory)) {
  throw new Error("Nuxt production output is missing; run the web build before bundle verification")
}

const chunks = readdirSync(assetDirectory)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => ({
    fileName,
    source: readFileSync(join(assetDirectory, fileName), "utf8")
  }))
const p5Chunks = chunks.filter(
  ({ source }) => source.includes("p5.Geometry") && source.includes("createCanvas")
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

const incrementalChunks = [p5Chunk, ...referringChunks, ...presetChunks]
const incrementalGzipBytes = incrementalChunks.reduce(
  (total, chunk) => total + gzipSync(chunk.source).byteLength,
  0
)
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

process.stdout.write(
  JSON.stringify(
    {
      result: "PASS",
      p5Chunk: p5Chunk.fileName,
      dynamicHosts: referringChunks.map(({ fileName }) => fileName),
      presetChunks: presetChunks.map(({ fileName }) => fileName),
      serverResourceHints: serverHintedFiles,
      incrementalGzipBytes,
      incrementalGzipBudgetBytes: P5_INCREMENTAL_GZIP_BUDGET_BYTES,
      ordinaryRouteTransferGate: "apps/web/tests/e2e/us2-creative-lifecycle.spec.ts"
    },
    null,
    2
  ) + "\n"
)

function hasDynamicImport(source, fileName) {
  return ["`", "'", '"'].some((quote) => source.includes(`import(${quote}./${fileName}${quote})`))
}

function dynamicImports(source) {
  return Array.from(
    source.matchAll(/import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/gu),
    (match) => match[1]
  ).filter(Boolean)
}
