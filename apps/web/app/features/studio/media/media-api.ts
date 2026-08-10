import {
  completeUpload,
  requestUploadIntent,
  type MediaCompleteResult,
  type MediaUploadIntent,
  type MediaUploadRequest
} from "../studio-api"

export type { MediaCompleteResult, MediaUploadIntent, MediaUploadRequest }
export { completeUpload, requestUploadIntent }

export async function sha256Hex(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function putPrivateOriginal(
  intent: MediaUploadIntent,
  file: Blob,
  contentType: string
): Promise<void> {
  const response = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file
  })
  if (!response.ok) throw new Error(`private upload failed (${response.status})`)
}
