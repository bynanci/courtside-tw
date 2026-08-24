import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const repositoryRoot = new URL("../../../../", import.meta.url)

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, repositoryRoot), "utf8")
}

test("the repository exposes one bounded public-reader demo command", async () => {
  const rootPackage = JSON.parse(await read("package.json")) as {
    scripts?: Record<string, string>
  }
  const webPackage = JSON.parse(await read("apps/web/package.json")) as {
    scripts?: Record<string, string>
  }
  const makefile = await read("Makefile")
  const readme = await read("README.md")

  assert.equal(rootPackage.scripts?.demo, "node apps/web/scripts/start-reader-demo.mjs")
  assert.equal(rootPackage.scripts?.["test:demo"], "node apps/web/scripts/verify-reader-demo.mjs")
  assert.equal(webPackage.scripts?.["dev:demo"], "node scripts/start-reader-demo.mjs")
  assert.equal(webPackage.scripts?.["test:demo"], "node scripts/verify-reader-demo.mjs")
  assert.match(makefile, /^demo: check-toolchain$/m)
  assert.match(makefile, /\$\(PNPM\) run demo/)
  assert.match(readme, /make demo/)
  assert.match(readme, /pnpm demo/)
})

test("the demo is public-read only and serves visible rights-safe media", async () => {
  const source = await read("apps/web/scripts/start-reader-demo.mjs")

  assert.match(source, /public reader demo/i)
  assert.match(source, /image\/svg\+xml/)
  assert.match(source, /access-control-allow-origin/)
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /COURTSIDE_LOCAL_DEMO/)
  assert.match(source, /NITRO_HOST: HOST/)
  assert.match(source, /NITRO_PORT: String\(WEB_PORT\)/)
  assert.match(source, /waitForDemoReady/)
  assert.match(source, /\["exec", "nuxt", "build"\]/)
  assert.match(source, /\.output\/server\/index\.mjs/)
  assert.doesNotMatch(source, /\/authorize|clientSecret|access_token|STUDIO_ACCESS_TOKEN/)
})

test("the demo only advertises reader capabilities that its fixture serves", async () => {
  const nuxtConfig = await read("apps/web/nuxt.config.ts")
  const demoRunner = await read("apps/web/scripts/start-reader-demo.mjs")
  const e2eServer = await read("apps/web/tests/e2e/start-server.mjs")
  const performanceServer = await read("tests/performance/start-server.mjs")
  const issuePage = await read("apps/web/app/pages/issues/[issueSlug].vue")

  assert.match(nuxtConfig, /localReaderDemo:\s*false/)
  assert.match(demoRunner, /NUXT_PUBLIC_LOCAL_READER_DEMO:\s*"true"/)
  assert.match(e2eServer, /NUXT_PUBLIC_LOCAL_READER_DEMO:\s*"false"/)
  assert.match(performanceServer, /NUXT_PUBLIC_LOCAL_READER_DEMO:\s*"false"/)
  assert.match(issuePage, /<template v-if="issue">/)
  assert.match(issuePage, /v-if="!config\.public\.localReaderDemo"/)
})
