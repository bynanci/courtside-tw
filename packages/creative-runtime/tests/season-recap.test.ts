import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeSeasonRecapParameters,
  prepareCreativePreset,
  resolveCreativePreset
} from "../src/index.ts"
import type { CourtPulseP5 } from "../src/contracts.ts"

test("season recap is an explicitly registered local preset while court pulse is preserved", () => {
  assert.equal(resolveCreativePreset("season-recap-v1")?.id, "season-recap-v1")
  assert.equal(resolveCreativePreset("court-pulse-v1")?.id, "court-pulse-v1")
  assert.equal(resolveCreativePreset("season-recap-v2"), null)
  assert.equal(resolveCreativePreset("https://example.com/recap.js"), null)
})

test("recap rejects private or unbounded input instead of silently including it", () => {
  const valid = { values: [0, 0.5, 1], lineWeight: 2, paletteId: "season-ink" }
  assert.deepEqual(normalizeSeasonRecapParameters(valid), valid)
  for (const parameters of [
    { ...valid, email: "private@example.invalid" },
    { ...valid, values: [] },
    { ...valid, values: Array.from({ length: 33 }, () => 0.5) },
    { ...valid, values: [NaN] },
    { ...valid, values: [1.01] },
    { ...valid, lineWeight: 0 },
    { ...valid, paletteId: "https://example.com/palette" }
  ]) {
    assert.throws(() => normalizeSeasonRecapParameters(parameters), /invalid season recap/)
  }
  const normalized = normalizeSeasonRecapParameters(valid)
  normalized.values[0] = 0.9
  assert.equal(valid.values[0], 0)
})

async function drawing(seed: number, values = [0.25, 0.5, 0.75]): Promise<string> {
  const commands: unknown[] = []
  const record = (name: string, ...args: unknown[]) => commands.push([name, ...args])
  const instance = {
    width: 640,
    height: 180,
    setup: () => undefined,
    draw: () => undefined,
    drawingContext: Object.fromEntries(
      ["beginPath", "arc", "stroke", "fill"].map((name) => [
        name,
        (...args: unknown[]) => record(name, ...args)
      ])
    ),
    ...Object.fromEntries(
      [
        "background",
        "push",
        "pop",
        "stroke",
        "strokeWeight",
        "noFill",
        "fill",
        "noStroke",
        "rect",
        "line",
        "noLoop"
      ].map((name) => [name, (...args: unknown[]) => record(name, ...args)])
    ),
    createCanvas: (width: number, height: number) => {
      record("canvas", width, height)
      return {
        pixelDensity: (density: number) => record("density", density),
        resize: (width: number, height: number) => record("resize", width, height)
      }
    }
  } as unknown as CourtPulseP5
  const preset = prepareCreativePreset("season-recap-v1", {
    values,
    lineWeight: 2,
    paletteId: "season-ink"
  })
  assert.ok(preset)
  const module = await preset.load()
  let render: () => void = () => undefined
  module.createSketch({
    seed,
    width: () => 640,
    onFrame: (frame) => record("frame", frame),
    onRenderReady: (controller) => {
      render = controller.render
      controller.resize(320, 180)
    }
  })(instance)
  instance.setup()
  render()
  return JSON.stringify(commands)
}

test("the bound preset uses recap values with deterministic geometry and bounded canvas", async () => {
  const first = await drawing(2026)
  assert.equal(first, await drawing(2026))
  assert.notEqual(first, await drawing(2027))
  assert.notEqual(first, await drawing(2026, [0.9]))
  assert.match(first, /\["canvas",640,180\]/u)
  assert.match(first, /\["resize",320,180\]/u)
  assert.match(first, /\["noLoop"\]/u)
})
