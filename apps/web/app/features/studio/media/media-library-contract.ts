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

/** Library membership stays independent of processing and rights state. */
export function canArchiveLibraryMedia(
  item: { archivedAt: string | null; processingState?: string } | null,
  busy: boolean
): boolean {
  return item !== null && item.archivedAt === null && !busy
}

export function mediaArchiveFeedback(status: number): string {
  return status === 409
    ? "媒體版本已變更；已清除選取，請重新選取最新資料後再封存。"
    : "封存未完成，請稍後重試。"
}

export function mediaPreviewFallback(altText: string | null, state: string): string {
  return `${altText || `媒體狀態：${state}`}；私人預覽目前無法顯示。`
}
