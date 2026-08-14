import { COURT_PULSE_PRESET_ID, type CreativePresetDefinition } from "./contracts.ts"

const CREATIVE_PRESET_REGISTRY = {
  [COURT_PULSE_PRESET_ID]: {
    id: COURT_PULSE_PRESET_ID,
    version: 1,
    load: () => import("./presets/court-pulse-v1.ts")
  }
} as const satisfies Record<string, CreativePresetDefinition>

export function resolveCreativePreset(value: unknown): CreativePresetDefinition | null {
  return value === COURT_PULSE_PRESET_ID ? CREATIVE_PRESET_REGISTRY[COURT_PULSE_PRESET_ID] : null
}
