export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const ALLOWED_MEDIA_TYPES = ["image/avif", "image/jpeg", "image/png", "image/webp"] as const
export const ALLOWED_MEDIA_CHANNELS = [
  "PUBLIC_WEB",
  "READER_LIBRARY",
  "OFFLINE",
  "PROVENANCE"
] as const

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number]
export type AllowedMediaChannel = (typeof ALLOWED_MEDIA_CHANNELS)[number]

export interface MediaUploadDraft {
  filename: string
  contentType: string
  sizeBytes: number
  checksumSha256: string
  altText: string
  credit: string
  rightsStatus: "UNKNOWN" | "PENDING" | "VALID" | "EXPIRED" | "REVOKED"
}

export interface MediaMetadataDraft {
  altText: string
  rightsOwner: string
  licenseName: string
  allowedChannels: AllowedMediaChannel[]
  territories: string[]
  validFrom: string
  validUntil: string
  credit: string
  withdrawalTerms: string
  rightsStatus: "UNKNOWN" | "PENDING" | "VALID" | "EXPIRED" | "REVOKED" | "BLOCKED"
}

export function validateMediaUpload(input: MediaUploadDraft): string[] {
  const errors: string[] = []
  const filename = input.filename.trim()
  if (
    !filename ||
    filename.length > 255 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..") ||
    [...filename].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x1f || codePoint === 0x7f
    })
  ) {
    errors.push("檔名不可包含路徑或控制字元。")
  }
  if (!ALLOWED_MEDIA_TYPES.includes(input.contentType as AllowedMediaType)) {
    errors.push("只接受 AVIF、JPEG、PNG 或 WebP 圖片。")
  }
  if (
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > MAX_UPLOAD_BYTES
  ) {
    errors.push("檔案必須在 20 MiB 以內。")
  }
  if (!/^[0-9a-f]{64}$/iu.test(input.checksumSha256.trim())) {
    errors.push("需要 64 碼 SHA-256 checksum。")
  }
  if (input.altText.trim().length > 1000) {
    errors.push("替代文字不可超過 1000 字。")
  }
  if (input.credit.trim().length > 1000) {
    errors.push("credit 不可超過 1000 字。")
  }
  return errors
}

export function canSubmitMedia(
  state: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "REVOKED",
  input: Pick<MediaUploadDraft, "altText" | "credit" | "rightsStatus">,
  validationErrors: readonly string[]
): boolean {
  return (
    validationErrors.length === 0 &&
    state !== "PROCESSING" &&
    state !== "REVOKED" &&
    input.altText.trim().length > 0 &&
    input.credit.trim().length > 0 &&
    input.rightsStatus === "VALID"
  )
}

export function validateMediaMetadata(input: MediaMetadataDraft): string[] {
  const errors: string[] = []
  if (!input.altText.trim()) errors.push("替代文字不可為空。")
  if (!input.rightsOwner.trim()) errors.push("需要 rights owner。")
  if (!input.licenseName.trim()) errors.push("需要 license name。")
  if (!input.credit.trim()) errors.push("需要 credit。")
  if (!input.withdrawalTerms.trim()) errors.push("需要 withdrawal terms。")
  if (!input.allowedChannels.length) errors.push("至少選擇一個發布 channel。")
  if (input.allowedChannels.some((channel) => !ALLOWED_MEDIA_CHANNELS.includes(channel))) {
    errors.push("發布 channel 不在允許清單內。")
  }
  if (!input.territories.length) errors.push("至少填寫一個 territory。")
  if (!input.validFrom || Number.isNaN(Date.parse(input.validFrom))) {
    errors.push("需要有效的 rights 起始時間。")
  }
  if (!input.validUntil || Number.isNaN(Date.parse(input.validUntil))) {
    errors.push("需要有效的 rights 到期時間。")
  }
  if (
    input.validFrom &&
    input.validUntil &&
    Date.parse(input.validUntil) <= Date.parse(input.validFrom)
  ) {
    errors.push("rights 到期時間必須晚於起始時間。")
  }
  return errors
}
