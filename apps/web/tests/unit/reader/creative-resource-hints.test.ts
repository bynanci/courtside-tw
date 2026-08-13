import assert from "node:assert/strict"
import test from "node:test"

import { removeCreativeRuntimePrefetch } from "../../../config/creative-resource-hints.ts"

test("article SSR hints omit p5 and the trusted preset without changing runtime imports", () => {
  const manifest = {
    "pages/articles/[articleSlug].vue": {
      dynamicImports: [
        "../../../node_modules/.pnpm/p5@2.3.0/node_modules/p5/dist/app.js",
        "../../../packages/creative-runtime/src/presets/court-pulse-v1.ts",
        "../../../apps/web/app/features/reader/other-lazy-feature.ts"
      ]
    },
    "pages/other.vue": {
      dynamicImports: ["../../../node_modules/.pnpm/p5@2.3.0/node_modules/p5/dist/app.js"]
    }
  }

  removeCreativeRuntimePrefetch(manifest)

  assert.deepEqual(manifest["pages/articles/[articleSlug].vue"].dynamicImports, [
    "../../../apps/web/app/features/reader/other-lazy-feature.ts"
  ])
  assert.deepEqual(manifest["pages/other.vue"].dynamicImports, [
    "../../../node_modules/.pnpm/p5@2.3.0/node_modules/p5/dist/app.js"
  ])
})
