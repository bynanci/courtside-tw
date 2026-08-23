import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const webRoot = new URL("../../../", import.meta.url)

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, webRoot), "utf8")
}

test("Home implements the approved Arena Editorial masthead without losing the reader path", async () => {
  const source = await read("app/pages/index.vue")

  assert.match(source, /class="arena-masthead"/)
  assert.match(source, /class="arena-masthead__court"/)
  assert.match(source, /class="arena-masthead__issue"/)
  assert.match(source, /data-testid="home-issue-link"/)
  assert.match(source, /先閱讀，/)
  assert.match(source, /本期命題/)
})

test("public surfaces use the approved semantic theme and article measure", async () => {
  const mainCss = await read("app/assets/css/main.css")
  const nuxtConfig = await read("nuxt.config.ts")

  for (const token of [
    "--color-bg-page",
    "--color-bg-surface",
    "--color-bg-hero",
    "--color-text-primary",
    "--color-text-on-hero",
    "--color-action",
    "--color-border-subtle"
  ]) {
    assert.match(mainCss, new RegExp(token))
  }
  assert.match(mainCss, /@media \(prefers-color-scheme: dark\)/)
  assert.match(mainCss, /@media \(forced-colors: active\)/)
  assert.match(mainCss, /\.arena-masthead\s*\{[^}]*background:\s*var\(--color-bg-hero\)/s)
  assert.match(mainCss, /--color-action-on-hero:\s*var\(--palette-vermilion-400\)/)
  assert.match(mainCss, /\.site-brand\s*\{[^}]*min-height:\s*44px/s)
  assert.match(mainCss, /a\.text-link\s*\{[^}]*min-height:\s*44px/s)
  assert.match(mainCss, /\.back-link\s*\{[^}]*min-height:\s*44px/s)
  assert.match(mainCss, /\.button-link\s*\{[^}]*min-height:\s*48px/s)
  assert.match(
    mainCss,
    /@media \(max-width: 40rem\)[\s\S]*?\.site-header nav\s*\{[^}]*gap:\s*0\.5rem/s
  )
  assert.match(mainCss, /\.article-content\s*\{[^}]*max-width:\s*42rem/s)
  assert.match(mainCss, /\.article-header h1[\s\S]*font-size:/)
  assert.match(nuxtConfig, /name:\s*"theme-color"/)
  assert.match(nuxtConfig, /prefers-color-scheme: dark/)
})

test("Issue and reader utility surfaces preserve the Arena hero and adaptive contrast", async () => {
  const issueSource = await read("app/pages/issues/[issueSlug].vue")
  const mainCss = await read("app/assets/css/main.css")
  const offlineLibrary = await read("app/features/offline/components/OfflineLibraryPanel.vue")
  const libraryPage = await read("app/pages/library.vue")
  const privacyPage = await read("app/pages/settings/privacy.vue")

  assert.match(issueSource, /class="issue-hero"/)
  assert.match(issueSource, /class="issue-header__number"/)
  assert.match(issueSource, /href="#toc"/)
  assert.match(mainCss, /\.issue-hero\s*\{[^}]*background:\s*var\(--color-bg-hero\)/s)
  assert.match(mainCss, /aspect-ratio:\s*4\s*\/\s*5/)
  assert.match(offlineLibrary, /background:\s*var\(--color-bg-surface\)/)
  assert.match(libraryPage, /border-bottom:\s*1px solid var\(--color-border-subtle\)/)
  assert.match(privacyPage, /background:\s*var\(--color-danger\)/)
  assert.match(privacyPage, /color:\s*var\(--color-on-danger\)/)
})
