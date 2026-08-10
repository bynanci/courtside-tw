import { canStudioAction } from "../studio-rbac.ts"
import type { MediaMetadataUpdate } from "../studio-api.ts"
import type { StudioMediaState, StudioRole } from "../studio-contract.ts"
import type { MediaMetadataDraft } from "./upload-contract.ts"

export function canStartMediaUpload(
  role: StudioRole,
  fileSelected: boolean,
  busy: boolean,
  state: StudioMediaState,
  validationErrors: readonly string[]
): boolean {
  return (
    canStudioAction(role, "upload") &&
    fileSelected &&
    !busy &&
    state !== "PROCESSING" &&
    state !== "REVOKED" &&
    validationErrors.length === 0
  )
}

export function canPersistMediaMetadata(
  role: StudioRole,
  assetId: string | null,
  metadataVersion: number | null,
  busy: boolean,
  metadataBusy: boolean,
  validationErrors: readonly string[]
): boolean {
  return (
    canStudioAction(role, "edit") &&
    Boolean(assetId) &&
    metadataVersion !== null &&
    !busy &&
    !metadataBusy &&
    validationErrors.length === 0
  )
}

export function buildMediaMetadataUpdate(
  draft: MediaMetadataDraft,
  rightsVersion: number | null
): MediaMetadataUpdate {
  return {
    altText: draft.altText.trim(),
    rights: {
      ...(rightsVersion === null ? {} : { version: rightsVersion }),
      rightsOwner: draft.rightsOwner.trim(),
      licenseName: draft.licenseName.trim(),
      allowedChannels: draft.allowedChannels,
      territories: draft.territories.map((territory) => territory.trim()).filter(Boolean),
      validFrom: draft.validFrom,
      validUntil: draft.validUntil,
      credit: draft.credit.trim(),
      withdrawalTerms: draft.withdrawalTerms.trim(),
      status: draft.rightsStatus
    }
  }
}
