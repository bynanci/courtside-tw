export const COURT_PULSE_PRESET_ID = "court-pulse-v1" as const

export type CourtPulseParameters = {
  density: number
  tempo: number
  lineWeight: number
  paletteId: "court-dusk"
  numericSequence: number[]
}

export type CourtPulsePresetInput = {
  seed: number
  parameters: CourtPulseParameters
}

export type CourtPulseP5 = {
  readonly HALF_PI: number
  readonly frameCount: number
  readonly height: number
  readonly width: number
  setup: () => void
  draw: () => void
  background: (...values: number[]) => void
  push: () => void
  pop: () => void
  stroke: (...values: number[]) => void
  strokeWeight: (value: number) => void
  noFill: () => void
  fill: (...values: number[]) => void
  noStroke: () => void
  rect: (x: number, y: number, width: number, height: number, radius?: number) => void
  line: (x1: number, y1: number, x2: number, y2: number) => void
  arc: (x: number, y: number, width: number, height: number, start: number, stop: number) => void
  circle: (x: number, y: number, diameter: number) => void
  createCanvas: (width: number, height: number) => { parent: (host: HTMLElement) => void }
  pixelDensity: (value: number) => void
  frameRate: (value: number) => void
  randomSeed: (value: number) => void
  noiseSeed: (value: number) => void
  noLoop: () => void
}

export type CreativePresetModule = {
  createSketch: (
    input: CourtPulsePresetInput & {
      host: HTMLElement
      width: () => number
      onFrame: (frame: number) => void
    }
  ) => (instance: CourtPulseP5) => void
}

export type CreativePresetDefinition = {
  id: typeof COURT_PULSE_PRESET_ID
  version: 1
  load: () => Promise<CreativePresetModule>
}
