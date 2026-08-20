import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  boundedCanvasWidth,
  createActiveLoopCoordinator,
  nextFrameThrottleState,
  nextPauseTimerState,
  normalizeCourtPulseParameters,
  runtimeVisibilityDecision,
  resolveCreativePreset
} from "../src/index.ts"
import { createSketch } from "../src/presets/court-pulse-v1.ts"

function courtPulseCommandDigest(seed: number, density = 12): string {
  const commands: unknown[][] = []
  let renderFrame: () => void = () => undefined
  const record = (name: string, ...values: unknown[]) => commands.push([name, ...values])
  const instance = {
    width: 640,
    height: 180,
    drawingContext: {
      beginPath: () => record("beginPath"),
      arc: (...values: number[]) => record("arc", ...values),
      stroke: () => record("contextStroke"),
      fill: () => record("contextFill")
    },
    setup: () => undefined,
    draw: () => undefined,
    background: (...values: number[]) => record("background", ...values),
    push: () => record("push"),
    pop: () => record("pop"),
    stroke: (...values: number[]) => record("stroke", ...values),
    strokeWeight: (value: number) => record("strokeWeight", value),
    noFill: () => record("noFill"),
    fill: (...values: number[]) => record("fill", ...values),
    noStroke: () => record("noStroke"),
    rect: (x: number, y: number, width: number, height: number, radius?: number) =>
      record("rect", x, y, width, height, ...(radius === undefined ? [] : [radius])),
    line: (...values: number[]) => record("line", ...values),
    createCanvas: (width: number, height: number) => {
      record("createCanvas", width, height)
      return {
        pixelDensity: (value: number) => record("pixelDensity", value),
        resize: (resizedWidth: number, resizedHeight: number) =>
          record("resize", resizedWidth, resizedHeight)
      }
    },
    noLoop: () => record("noLoop")
  }
  const render = createSketch({
    seed,
    parameters: normalizeCourtPulseParameters({
      density,
      tempo: 0.75,
      lineWeight: 2,
      numericSequence: [0.1, 0.5, 0.9]
    }),
    width: () => 640,
    onRenderReady: (controller) => {
      renderFrame = controller.render
      controller.resize(320, 180)
    },
    onFrame: (frame) => record("frame", frame)
  })
  render(instance)
  instance.setup()
  renderFrame()
  return JSON.stringify(commands)
}

test("creative preset resolution is a total local allowlist", () => {
  assert.equal(resolveCreativePreset("court-pulse-v1")?.id, "court-pulse-v1")
  assert.equal(resolveCreativePreset("court-pulse-v2"), null)
  assert.equal(resolveCreativePreset("../../../remote-module"), null)
})

test("court-pulse parameters are clamped to the approved runtime envelope", () => {
  assert.deepEqual(
    normalizeCourtPulseParameters({
      density: 999,
      tempo: -1,
      lineWeight: 99,
      paletteId: "attacker-palette",
      numericSequence: [...Array.from({ length: 80 }, () => 2), Number.NaN]
    }),
    {
      density: 48,
      tempo: 0.25,
      lineWeight: 3,
      paletteId: "court-dusk",
      numericSequence: Array.from({ length: 64 }, () => 1)
    }
  )
})

test("the runtime coordinator permits only one active loop", () => {
  const events: string[] = []
  const coordinator = createActiveLoopCoordinator()
  coordinator.claim("first", () => events.push("pause:first"))
  coordinator.claim("second", () => events.push("pause:second"))

  assert.deepEqual(events, ["pause:first"])
  assert.equal(coordinator.currentOwner(), "second")
  coordinator.release("second")
  assert.equal(coordinator.currentOwner(), null)
})

test("frame throttling requires sustained slow gaps and resets after a normal frame", () => {
  const firstSlowFrame = nextFrameThrottleState({
    previousTimestamp: 1_000,
    currentTimestamp: 1_250,
    consecutiveSlowFrames: 0,
    thresholdMilliseconds: 200,
    requiredConsecutiveSlowFrames: 2
  })
  assert.deepEqual(firstSlowFrame, { consecutiveSlowFrames: 1, suspend: false })

  const recoveredFrame = nextFrameThrottleState({
    previousTimestamp: 1_250,
    currentTimestamp: 1_267,
    consecutiveSlowFrames: firstSlowFrame.consecutiveSlowFrames,
    thresholdMilliseconds: 200,
    requiredConsecutiveSlowFrames: 2
  })
  assert.deepEqual(recoveredFrame, { consecutiveSlowFrames: 0, suspend: false })

  const secondSlowFrame = nextFrameThrottleState({
    previousTimestamp: 1_250,
    currentTimestamp: 1_550,
    consecutiveSlowFrames: firstSlowFrame.consecutiveSlowFrames,
    thresholdMilliseconds: 200,
    requiredConsecutiveSlowFrames: 2
  })
  assert.deepEqual(secondSlowFrame, { consecutiveSlowFrames: 2, suspend: true })
})

test("preset modules are selected only by the trusted registry", async () => {
  const source = await readFile(new URL("../src/registry.ts", import.meta.url), "utf8")
  assert.match(source, /court-pulse-v1/)
  assert.doesNotMatch(source, /import\s*\([^"']/u)
  assert.doesNotMatch(source, /https?:\/\//u)
  assert.doesNotMatch(source, /eval\s*\(|new Function/u)
})

test("near viewport may preload but only 25 percent visible content may loop", () => {
  assert.deepEqual(runtimeVisibilityDecision({ intersectionRatio: 0.05, documentVisible: true }), {
    preload: true,
    run: false,
    delayedPause: true
  })
  assert.deepEqual(runtimeVisibilityDecision({ intersectionRatio: 0.2, documentVisible: true }), {
    preload: true,
    run: false,
    delayedPause: false
  })
  assert.deepEqual(runtimeVisibilityDecision({ intersectionRatio: 0.25, documentVisible: true }), {
    preload: true,
    run: true,
    delayedPause: false
  })
  assert.deepEqual(runtimeVisibilityDecision({ intersectionRatio: 1, documentVisible: false }), {
    preload: true,
    run: false,
    delayedPause: false
  })
})

test("returning to the hysteresis band cancels a pending offscreen pause", () => {
  const belowTenPercent = runtimeVisibilityDecision({
    intersectionRatio: 0.05,
    documentVisible: true
  })
  const hysteresisBand = runtimeVisibilityDecision({
    intersectionRatio: 0.2,
    documentVisible: true
  })

  assert.equal(nextPauseTimerState("clear", belowTenPercent), "scheduled")
  assert.equal(nextPauseTimerState("scheduled", hysteresisBand), "clear")
})

test("canvas bitmap width stays within the 1.5M pixel envelope", () => {
  assert.equal(boundedCanvasWidth(20_000, 180, 1), 8_333)
  assert.equal(boundedCanvasWidth(20_000, 180, 1.5), 3_703)
  assert.equal(boundedCanvasWidth(1_200, 180, 1.5), 1_200)
})

test("court-pulse drawing is deterministic and the fixed seed changes geometry", () => {
  const first = courtPulseCommandDigest(2026)
  assert.match(first, /\["resize",320,180\]/u)
  assert.match(first, /\["arc",320,90,32,0,6\.283185307179586\]/u)
  assert.match(first, /\["frame",1\]/u)
  assert.equal(first, courtPulseCommandDigest(2026))
  assert.notEqual(first, courtPulseCommandDigest(2027))
  assert.notEqual(first, courtPulseCommandDigest(2026, 13))
})
