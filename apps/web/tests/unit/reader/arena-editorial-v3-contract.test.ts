import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const webRoot = new URL("../../../", import.meta.url)
const repositoryRoot = new URL("../../../../../", import.meta.url)

async function readWeb(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, webRoot), "utf8")
}

async function readRepository(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, repositoryRoot), "utf8")
}

test("Arena Editorial v0.3 is documented before its implementation", async () => {
  const [design, specification, tasks] = await Promise.all([
    readRepository("DESIGN.md"),
    readRepository("docs/design/arena-editorial-v3.md"),
    readRepository("docs/design/arena-editorial-v3-tasks.md")
  ])

  assert.match(design, /Arena Editorial v0\.3/)
  assert.match(design, /issue #186/i)
  assert.match(specification, /Arena Night × Editorial Paper/)
  assert.match(specification, /style-reference \/ draft-only/)
  assert.match(specification, /primitive → semantic → component/)
  assert.match(specification, /320px/)
  assert.match(specification, /200% zoom/)
  assert.match(tasks, /UIR-001/)
  assert.match(tasks, /UIR-017/)
  assert.doesNotMatch(tasks, /^- \[[ xX]\] T\d{3}\b/m)
})

test("the shared public shell exposes only live routes with native no-JS navigation", async () => {
  const [header, dock] = await Promise.all([
    readWeb("app/components/navigation/PublicSiteHeader.vue"),
    readWeb("app/components/navigation/PublicMobileDock.vue")
  ])

  for (const route of ['to="/"', 'to="/issues"', 'to="/search"', 'to="/library"']) {
    assert.match(header, new RegExp(route.replaceAll("/", "\\/")))
    assert.match(dock, new RegExp(route.replaceAll("/", "\\/")))
  }
  assert.match(header, /<details/)
  assert.match(header, /<summary/)
  assert.match(header, /@keydown\.esc/)
  assert.match(header, /containMenuFocus/)
  assert.match(header, /aria-current/)
  assert.match(header, /onMounted/)
  assert.match(header, /v-if="enhancementReady"[\s\S]*?class="public-menu__close"/)
  assert.match(header, /matchMedia\("\(min-width: 48\.0625rem\)"\)/)
  assert.match(header, /contextLabel/)
  assert.match(dock, /aria-label="行動版主要導覽"/)
  assert.match(dock, /aria-current/)
  assert.doesNotMatch(`${header}\n${dock}`, /to="\/(?:people|culture|about)"/)
  assert.doesNotMatch(`${header}\n${dock}`, /#[0-9a-fA-F]{3,8}\b/)
})

test("every non-article public surface uses the shared header and mobile dock", async () => {
  const pagePaths = [
    "app/pages/index.vue",
    "app/pages/issues/index.vue",
    "app/pages/issues/[issueSlug].vue",
    "app/pages/search.vue",
    "app/pages/library.vue",
    "app/pages/settings/privacy.vue"
  ]
  const pages = await Promise.all(pagePaths.map(readWeb))

  for (const page of pages) {
    assert.match(page, /<PublicSiteHeader/)
    assert.match(page, /<PublicMobileDock/)
    assert.doesNotMatch(page, /<header class="site-header(?:\s|">)/)
  }

  const article = await readWeb("app/pages/articles/[articleSlug].vue")
  assert.match(article, /<PublicSiteHeader[\s\S]*?mode="reader"/)
  assert.doesNotMatch(article, /<PublicMobileDock/)
  assert.match(article, /class="article-header__signal"/)
  assert.match(article, /:context-label=/)
  assert.match(article, /返回所有期數/)
  assert.ok(
    article.indexOf('<header class="article-header"') < article.indexOf("<ReaderJourneyRail"),
    "article identity and metadata must precede the reading journey"
  )

  const issueDetail = pages[2]
  assert.doesNotMatch(issueDetail, /<ReadingState/)
  assert.match(issueDetail, /<h1>找不到這一期<\/h1>/)
  assert.match(issueDetail, /<h1>期數目錄暫時無法載入<\/h1>/)
  assert.match(issueDetail, /<h1>正在載入期數<\/h1>/)
})

test("v0.3 tokens and responsive rules encode a mobile scene rather than a shrunken split", async () => {
  const [home, css] = await Promise.all([
    readWeb("app/pages/index.vue"),
    readWeb("app/assets/css/main.css")
  ])

  for (const token of [
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-6",
    "--space-8",
    "--size-control-min",
    "--surface-public-header",
    "--surface-public-dock",
    "--color-scene-scrim"
  ]) {
    assert.match(css, new RegExp(token))
  }

  assert.match(home, /<PublicSiteHeader\s+tone="hero"/)
  assert.match(home, /class="[^"]*arena-masthead__media[^"]*"/)
  assert.match(home, /class="arena-masthead__copy"/)
  assert.match(css, /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)/)
  const mobile = css.indexOf("@media (max-width: 48rem)")
  const lock = css.indexOf("html[data-public-menu-open]")
  const desktop = css.indexOf("@media (min-width: 48.0625rem)")
  assert.ok(mobile >= 0 && mobile < lock && lock < desktop)
  assert.match(
    css,
    /@media \(max-width: 48rem\)[\s\S]*\.arena-masthead__media\s*\{[\s\S]*position:\s*absolute/
  )
  assert.match(
    css,
    /\.arena-masthead__inner\s*\{[\s\S]*padding:[^;]*var\(--size-public-dock\)[^;]*env\(safe-area-inset-bottom\)/
  )
  assert.match(
    css,
    /\.issue-hero__inner\s*\{[\s\S]*padding-block:[^;]*var\(--size-public-dock\)[^;]*env\(safe-area-inset-bottom\)/
  )
  assert.match(css, /@media \(min-width: 48\.0625rem\)/)
  assert.match(css, /@media \(min-width: 64rem\)/)
  assert.match(css, /\[data-block-type="gallery"\]/)
  assert.match(
    css,
    /\.public-menu__panel nav a\[aria-current="page"\]\s*,?[\s\S]*?text-decoration:\s*underline/
  )
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(
    css,
    /@media \(forced-colors: active\) and \(max-width: 48rem\)[\s\S]*?\.arena-masthead__media\s*\{[\s\S]*?display:\s*none/
  )
})
