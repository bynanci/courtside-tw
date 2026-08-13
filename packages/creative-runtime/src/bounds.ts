import type { CourtPulseParameters } from "./contracts.ts"

const DEFAULT_PARAMETERS: CourtPulseParameters = {
  density: 24,
  tempo: 0.55,
  lineWeight: 1.5,
  paletteId: "court-dusk",
  numericSequence: []
}

export function normalizeCourtPulseParameters(value: unknown): CourtPulseParameters {
  const input = isRecord(value) ? value : {}
  const numericSequence = Array.isArray(input.numericSequence)
    ? input.numericSequence
        .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
        .map((entry) => clamp(entry, 0, 1))
        .slice(0, 64)
    : DEFAULT_PARAMETERS.numericSequence

  return {
    density: Math.round(clamp(finiteNumber(input.density, DEFAULT_PARAMETERS.density), 8, 48)),
    tempo: clamp(finiteNumber(input.tempo, DEFAULT_PARAMETERS.tempo), 0.25, 1),
    lineWeight: clamp(finiteNumber(input.lineWeight, DEFAULT_PARAMETERS.lineWeight), 1, 3),
    paletteId: "court-dusk",
    numericSequence
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
