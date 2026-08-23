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
