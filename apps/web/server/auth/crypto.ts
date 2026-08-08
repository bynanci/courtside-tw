import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url")
}

export function pkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url")
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) {
    return false
  }
  return timingSafeEqual(leftBytes, rightBytes)
}
