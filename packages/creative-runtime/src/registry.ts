import { normalizeCourtPulseParameters, normalizeSeasonRecapParameters } from "./bounds.ts"
import {
  COURT_PULSE_PRESET_ID,
  SEASON_RECAP_PRESET_ID,
  type CreativePresetDefinition,
  type PreparedCreativePreset
} from "./contracts.ts"

const CREATIVE_PRESET_REGISTRY = {
  [COURT_PULSE_PRESET_ID]: {
    id: COURT_PULSE_PRESET_ID,
    version: 1,
    normalizeParameters: normalizeCourtPulseParameters,
    load: () => import("./presets/court-pulse-v1.ts")
  },
  [SEASON_RECAP_PRESET_ID]: {
    id: SEASON_RECAP_PRESET_ID,
    version: 1,
    normalizeParameters: normalizeSeasonRecapParameters,
    load: () => import("./presets/season-recap-v1.ts")
  }
} as const satisfies Record<string, CreativePresetDefinition>

export function resolveCreativePreset(value: unknown): CreativePresetDefinition | null {
  if (value === COURT_PULSE_PRESET_ID) return CREATIVE_PRESET_REGISTRY[COURT_PULSE_PRESET_ID]
  if (value === SEASON_RECAP_PRESET_ID) return CREATIVE_PRESET_REGISTRY[SEASON_RECAP_PRESET_ID]
  return null
}

export function prepareCreativePreset(
  value: unknown,
  rawParameters: unknown
): PreparedCreativePreset | null {
  const preset = resolveCreativePreset(value)
  if (!preset) return null
  // Narrow before binding parameters so a recap can never pass through the court-pulse normalizer.
  if (preset.id === COURT_PULSE_PRESET_ID) {
    const parameters = preset.normalizeParameters(rawParameters)
    return {
      id: preset.id,
      load: async () => {
        const module = await preset.load()
        return { createSketch: (input) => module.createSketch({ ...input, parameters }) }
      }
    }
  }
  const parameters = preset.normalizeParameters(rawParameters)
  return {
    id: preset.id,
    load: async () => {
      const module = await preset.load()
      return { createSketch: (input) => module.createSketch({ ...input, parameters }) }
    }
  }
}
