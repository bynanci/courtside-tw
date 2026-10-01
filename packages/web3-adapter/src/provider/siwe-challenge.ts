import { parseSiweMessage } from "viem/siwe"

export type SiweChallenge = {
  nonce: string
  domain: string
  chainId: string
  expiresAt: string
  message: string
}
export type ChallengeRequest = { domain: string; uri: string; address: string; chainId: string }

export function validateSiweChallenge(
  challenge: SiweChallenge,
  input: ChallengeRequest,
  now: number
): void {
  const invalid = () => {
    throw new Error("INVALID_CHALLENGE")
  }
  if (
    !challenge ||
    typeof challenge.message !== "string" ||
    challenge.message.length > 2000 ||
    !/^[a-zA-Z0-9]{16,128}$/u.test(challenge.nonce) ||
    challenge.domain !== input.domain ||
    challenge.chainId !== input.chainId ||
    challenge.message.includes("\r")
  )
    invalid()
  const parsed = parseSiweMessage(challenge.message)
  const lines = challenge.message.split("\n")
  // This slice accepts a bounded ERC-4361 message, with no resources or optional scope escalation.
  const keys = lines.slice(5).map((line) => line.split(": ", 1)[0])
  if (
    lines.length !== 11 ||
    lines[2] !== "" ||
    lines[4] !== "" ||
    !lines[3] ||
    lines[3].length > 240 ||
    JSON.stringify(keys) !==
      JSON.stringify(["URI", "Version", "Chain ID", "Nonce", "Issued At", "Expiration Time"])
  )
    invalid()
  const issuedAt = parsed.issuedAt?.getTime() ?? NaN
  const expiresAt = parsed.expirationTime?.getTime() ?? NaN
  if (
    parsed.domain !== input.domain ||
    parsed.uri !== input.uri ||
    parsed.version !== "1" ||
    parsed.address?.toLowerCase() !== input.address.toLowerCase() ||
    `eip155:${parsed.chainId}` !== input.chainId ||
    parsed.nonce !== challenge.nonce ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt !== Date.parse(challenge.expiresAt) ||
    expiresAt <= now ||
    issuedAt > now + 30_000 ||
    issuedAt < now - 300_000 ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 300_000
  )
    invalid()
}
