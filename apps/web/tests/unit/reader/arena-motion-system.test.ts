import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  readerMotion,
  readerMotionCssVariables
} from "../../../app/features/motion/reader-motion.ts"
import {
  defaultReaderMotionFlags,
  resolveReaderMotionPolicy
} from "../../../app/features/motion/reader-motion-policy.ts"
import {
  buildSharedIssueCoverPlan,
  sampleNoOvershootSpring
} from "../../../app/features/motion/shared-issue-cover.ts"

const webRoot = new URL("../../../", import.meta.url)

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, webRoot), "utf8")
}

test("the Arena motion system has one five-pattern token source", () => {
  assert.deepEqual(readerMotion.allowedPatterns, [
    "route-orient",
    "issue-cover-carry",
    "toc-unfold",
    "reading-progress-track",
    "action-confirm"
  ])
  assert.equal(readerMotion.primitive.durationMs.none, 0)
  assert.equal(readerMotion.primitive.durationMs.pressIn, 80)
  assert.equal(readerMotion.primitive.durationMs.progress, 90)
  assert.equal(readerMotion.primitive.durationMs.exit, 140)
  assert.equal(readerMotion.primitive.durationMs.fallback, 180)
  assert.equal(readerMotion.primitive.durationMs.enter, 220)
  assert.equal(readerMotion.primitive.durationMs.sharedMax, 360)
  assert.deepEqual(readerMotion.primitive.spring.issueCover, {
    stiffness: 320,
    damping: 32,
    mass: 0.9
  })
  assert.equal(readerMotion.issueCover.reduced.durationMs, 0)
  assert.equal(readerMotion.route.reduced.distancePx, 0)
  assert.equal(readerMotion.tocReveal.reduced.staggerMs, 0)
  assert.equal(readerMotion.press.reduced.scale, 1)

  assert.equal(readerMotionCssVariables["--motion-duration-enter"], "220ms")
  assert.equal(readerMotionCssVariables["--motion-duration-exit"], "140ms")
  assert.equal(readerMotionCssVariables["--motion-duration-shared"], "360ms")
  assert.equal(readerMotionCssVariables["--motion-distance-orient"], "8px")
  assert.equal(readerMotionCssVariables["--motion-scale-press"], "0.98")
})

test("motion policy makes flags, reduced motion, and Save-Data deterministic", () => {
  assert.deepEqual(
    resolveReaderMotionPolicy({
      flags: { ...defaultReaderMotionFlags, enabled: false },
      prefersReducedMotion: false,
      saveData: false
    }),
    {
      mode: "disabled",
      patterns: {
        route: false,
        issueCover: false,
        tocReveal: false,
        readingProgress: false,
        feedback: false
      },
      creativeMotionMode: "full",
      interactiveEnhancementsAllowed: true
    }
  )

  for (const constrained of [
    { prefersReducedMotion: true, saveData: false },
    { prefersReducedMotion: false, saveData: true }
  ]) {
    const policy = resolveReaderMotionPolicy({
      flags: defaultReaderMotionFlags,
      ...constrained
    })
    assert.equal(policy.mode, "reduced")
    assert.ok(Object.values(policy.patterns).every((enabled) => !enabled))
    assert.equal(policy.interactiveEnhancementsAllowed, false)
    assert.equal(policy.creativeMotionMode, constrained.prefersReducedMotion ? "reduced" : "full")
  }

  const forcedColorsPolicy = resolveReaderMotionPolicy({
    flags: defaultReaderMotionFlags,
    prefersReducedMotion: false,
    saveData: false,
    forcedColors: true
  })
  assert.equal(forcedColorsPolicy.interactiveEnhancementsAllowed, false)
  assert.equal(forcedColorsPolicy.creativeMotionMode, "reduced")

  assert.deepEqual(
    resolveReaderMotionPolicy({
      flags: defaultReaderMotionFlags,
      prefersReducedMotion: false,
      saveData: false
    }),
    {
      mode: "full",
      patterns: {
        route: true,
        issueCover: true,
        tocReveal: false,
        readingProgress: true,
        feedback: true
      },
      creativeMotionMode: "full",
      interactiveEnhancementsAllowed: true
    }
  )

  const progressDisabledPolicy = resolveReaderMotionPolicy({
    flags: { ...defaultReaderMotionFlags, readingProgress: false },
    prefersReducedMotion: false,
    saveData: false
  })
  assert.equal(progressDisabledPolicy.patterns.readingProgress, false)
  assert.equal(progressDisabledPolicy.creativeMotionMode, "full")
  assert.equal(progressDisabledPolicy.interactiveEnhancementsAllowed, true)
})

test("shared issue-cover motion is bounded, physical, and has static fallbacks", () => {
  const spring = sampleNoOvershootSpring(12)
  assert.equal(spring[0], 0)
  assert.equal(spring.at(-1), 1)
  assert.ok(spring.every((sample) => sample >= 0 && sample <= 1))
  assert.ok(spring.every((sample, index) => index === 0 || sample >= spring[index - 1]!))

  const source = { left: 920, top: 180, width: 240, height: 300 }
  const target = { left: 900, top: 150, width: 280, height: 350 }
  const plan = buildSharedIssueCoverPlan(source, target, {
    capturedAt: 1_000,
    now: 1_250,
    viewportWidth: 1_440
  })
  assert.equal(plan?.kind, "spring")
  assert.equal(plan?.durationMs, 360)
  assert.equal(plan?.keyframes.at(0)?.offset, 0)
  assert.equal(plan?.keyframes.at(-1)?.transform, "translate3d(0px, 0px, 0) scale(1)")

  assert.equal(
    buildSharedIssueCoverPlan(source, target, {
      capturedAt: 1_000,
      now: 3_100,
      viewportWidth: 1_440
    }),
    null
  )
  assert.equal(
    buildSharedIssueCoverPlan(
      source,
      { ...target, height: 280 },
      {
        capturedAt: 1_000,
        now: 1_100,
        viewportWidth: 1_440
      }
    )?.kind,
    "fade"
  )
})

test("public reader pages integrate route, journey, and cover continuity without p5", async () => {
  const [home, issueIndex, issue, article, cover, app, plugin, config] = await Promise.all([
    read("app/pages/index.vue"),
    read("app/pages/issues/index.vue"),
    read("app/pages/issues/[issueSlug].vue"),
    read("app/pages/articles/[articleSlug].vue"),
    read("app/components/issues/SharedIssueCover.vue"),
    read("app/app.vue"),
    read("app/plugins/reader-motion.client.ts"),
    read("nuxt.config.ts")
  ])

  for (const page of [home, issueIndex, issue, article]) {
    assert.match(page, /pageTransition:\s*\{\s*name:\s*"reader-route",\s*mode:\s*"out-in"\s*\}/)
  }
  assert.match(home, /<ReaderJourneyRail\s+:active-step="1"/)
  assert.match(issue, /<ReaderJourneyRail\s+:active-step="2"/)
  assert.match(article, /<ReaderJourneyRail\s+:active-step="3"/)
  assert.match(home, /transition-role="source"/)
  assert.match(issueIndex, /<IssueCoverCard/)
  assert.match(issue, /transition-role="target"/)
  assert.match(issue, /site-page issue-detail-page/)
  assert.match(cover, /data-motion-pattern="issue-cover-carry"/)
  assert.match(cover, /onBeforeUnmount/)
  assert.doesNotMatch(cover, /requestAnimationFrame|nextTick/)
  assert.match(cover, /readerMotionNavigationSettledEvent/)
  assert.match(cover, /discardSharedIssueCover/)
  assert.doesNotMatch(app, /:style=|readerMotionCssVariables/)
  assert.match(plugin, /useState<ReaderMotionPolicy>/)
  assert.match(plugin, /router\.options\.scrollBehavior = wrappedScrollBehavior/)
  assert.match(plugin, /window\.dispatchEvent\(new Event\(readerMotionNavigationSettledEvent\)\)/)
  assert.equal((plugin.match(/requestAnimationFrame/g) ?? []).length, 1)
  assert.match(plugin, /if \(disposed\) return position/)
  assert.match(plugin, /vueApp\.onUnmount\(cleanup\)/)
  assert.match(article, /watch\(readerMotionPolicyState, applyReaderMotionPolicy\)/)
  assert.match(article, /readingProgressMotionMode\.value = policy\.patterns\.readingProgress/)
  assert.match(article, /creativeMotionMode\.value = policy\.creativeMotionMode/)
  assert.match(article, /:motion-mode="creativeMotionMode"/)
  assert.match(config, /creative:\s*\{[\s\S]*motion:\s*\{/)

  for (const source of [home, issueIndex, issue]) {
    assert.doesNotMatch(source, /\bp5\b|<canvas|requestAnimationFrame|setInterval/)
  }
  assert.doesNotMatch(cover, /\bp5\b|<canvas|setInterval/)
})

test("CSS enables only explicit full-motion states and preserves touch targets", async () => {
  const [css, articleCss, progress] = await Promise.all([
    read("app/assets/css/main.css"),
    read("app/assets/css/article.css"),
    read("app/features/reader/components/ReadingProgress.vue")
  ])
  const tabletRules = css.slice(
    css.indexOf("@media (max-width: 52rem)"),
    css.indexOf("@media (max-width: 40rem)")
  )
  const mobileRules = css.slice(
    css.indexOf("@media (max-width: 40rem)"),
    css.indexOf("@media (prefers-reduced-motion: reduce)")
  )

  assert.match(css, /html\[data-reader-motion="full"\]\[data-reader-motion-route="enabled"\]/)
  assert.match(css, /\.reader-route-enter-active[\s\S]*var\(--motion-duration-enter\)/)
  assert.doesNotMatch(css, /\.reader-route-leave-active|\.reader-route-leave-to/)
  assert.match(css, /\.reader-route-enter-from\.issue-detail-page\s*\{\s*transform:\s*none/s)
  for (const [name, value] of Object.entries(readerMotionCssVariables)) {
    assert.ok(css.includes(`${name}: ${value};`), `${name} must have a CSP-safe CSS mirror`)
  }
  assert.match(
    css,
    /html\[data-reader-motion-feedback="enabled"\][\s\S]*\.button-link:not\(:disabled\):active/
  )
  assert.match(css, /transform:\s*scale\(var\(--motion-scale-press\)\)/)
  assert.match(css, /\.issue-toc__article-link\s*\{[^}]*min-height:\s*44px/s)
  assert.match(css, /\.reader-journey__step\s*\{[^}]*min-height:\s*44px/s)
  assert.doesNotMatch(css, /animation-iteration-count:\s*infinite/)
  assert.doesNotMatch(tabletRules, /\.arena-masthead__inner\s*\{[^}]*grid-template-columns:\s*1fr/s)
  assert.match(mobileRules, /\.arena-masthead__inner\s*\{[^}]*grid-template-columns:\s*1fr/s)
  assert.match(mobileRules, /\.issue-header\s*\{[^}]*grid-template-areas:[^}]*"cover"[^}]*"copy"/s)
  assert.match(progress, /<rect class="reading-progress__bar" :width="percent"/)
  assert.doesNotMatch(progress, /:style=|style="/)
  assert.match(
    articleCss,
    /\.reading-progress__bar\s*\{[^}]*transition:\s*width var\(--motion-duration-progress\)/s
  )
})
