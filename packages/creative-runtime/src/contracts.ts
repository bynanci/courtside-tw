export const COURT_PULSE_PRESET_ID = "court-pulse-v1" as const
export const SEASON_RECAP_PRESET_ID = "season-recap-v1" as const

export type SeasonRecapParameters = {
  values: number[]
  lineWeight: number
  paletteId: "season-ink"
}

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

export type CourtPulseDrawingContext = {
  beginPath: () => void
  arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => void
  stroke: () => void
  fill: () => void
}

export type CreativeRuntimeController = {
  render: () => void
  resize: (width: number, height: number) => void
}

export type CourtPulseP5 = {
  readonly height: number
  readonly width: number
  readonly drawingContext: CourtPulseDrawingContext
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
  createCanvas: (width: number, height: number) => unknown
  noLoop: () => void
}

export type CreativePresetModule<Parameters = CourtPulseParameters> = {
  createSketch: (input: {
    seed: number
    parameters: Parameters
    width: () => number
    onRenderReady: (controller: CreativeRuntimeController) => void
    onFrame: (frame: number) => void
  }) => (instance: CourtPulseP5) => void
}

type PresetDefinition<Id extends string, Parameters> = {
  id: Id
  version: 1
  normalizeParameters: (value: unknown) => Parameters
  load: () => Promise<CreativePresetModule<Parameters>>
}

export type CreativePresetDefinition =
  | PresetDefinition<typeof COURT_PULSE_PRESET_ID, CourtPulseParameters>
  | PresetDefinition<typeof SEASON_RECAP_PRESET_ID, SeasonRecapParameters>

export type PreparedCreativePreset = {
  id: CreativePresetDefinition["id"]
  load: () => Promise<{
    createSketch: (
      input: Omit<Parameters<CreativePresetModule["createSketch"]>[0], "parameters">
    ) => (instance: CourtPulseP5) => void
  }>
}
