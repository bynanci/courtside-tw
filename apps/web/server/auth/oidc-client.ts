import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"

import { canonicalRoles, type OidcClientConfig, type CanonicalRole } from "./config.ts"
import { AuthSessionError } from "./errors.ts"

export type AuthorizationUrlInput = {
  state: string
  nonce: string
  codeChallenge: string
}

export type ExchangeCodeInput = {
  code: string
  codeVerifier: string
  redirectUri: string
}

export type OidcTokenSet = {
  accessToken: string
  idToken: string
  tokenType: "Bearer"
  expiresIn: number
  refreshToken?: string
}

export type VerifyIdTokenInput = {
  idToken: string
  nonce: string
}

export type RevokeTokensInput = {
  accessToken: string
  refreshToken?: string
}

export type VerifiedIdToken = {
  issuer: string
  subject: string
  audience: string
  nonce: string
  roles: CanonicalRole[]
}

export function buildAuthorizationUrl(
  config: OidcClientConfig,
  input: AuthorizationUrlInput
): string {
  const url = new URL(config.authorizationEndpoint)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("scope", config.scope.join(" "))
  url.searchParams.set("state", input.state)
  url.searchParams.set("nonce", input.nonce)
  url.searchParams.set("code_challenge", input.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

export async function exchangeAuthorizationCode(
  config: OidcClientConfig,
  input: ExchangeCodeInput,
  fetchImpl: typeof fetch = fetch
): Promise<OidcTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier
  })
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded"
  })
  if (config.clientSecret) {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString(
      "base64"
    )
    headers.set("authorization", `Basic ${basic}`)
  } else {
    body.set("client_id", config.clientId)
  }

  let response: Response
  try {
    response = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers,
      body,
      redirect: "error"
    })
  } catch {
    throw new AuthSessionError("OIDC_TOKEN_EXCHANGE_FAILED", 502)
  }

  if (!response.ok) {
    throw new AuthSessionError("OIDC_TOKEN_EXCHANGE_FAILED", 502)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AuthSessionError("OIDC_INVALID_RESPONSE", 502)
  }
  return parseTokenSet(payload)
}

export async function revokeOidcTokens(
  config: OidcClientConfig,
  input: RevokeTokensInput,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!config.revocationEndpoint) {
    return
  }

  const tokens = [
    ...(input.refreshToken ? [{ value: input.refreshToken, hint: "refresh_token" }] : []),
    { value: input.accessToken, hint: "access_token" }
  ]
  for (const token of tokens) {
    const body = new URLSearchParams({
      token: token.value,
      token_type_hint: token.hint
    })
    const headers = new Headers({
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    })
    if (config.clientSecret) {
      const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString(
        "base64"
      )
      headers.set("authorization", `Basic ${basic}`)
    } else {
      body.set("client_id", config.clientId)
    }

    let response: Response
    try {
      response = await fetchImpl(config.revocationEndpoint, {
        method: "POST",
        headers,
        body,
        redirect: "error"
      })
    } catch {
      throw new AuthSessionError("OIDC_TOKEN_REVOCATION_FAILED", 502)
    }
    if (!response.ok) {
      throw new AuthSessionError("OIDC_TOKEN_REVOCATION_FAILED", 502)
    }
  }
}

export function createIdTokenVerifier(
  config: OidcClientConfig,
  fetchImpl: typeof fetch = fetch
): (input: VerifyIdTokenInput) => Promise<VerifiedIdToken> {
  const safeFetch: typeof fetch = (input, init) => fetchImpl(input, { ...init, redirect: "error" })
  const jwks = createRemoteJWKSet(new URL(config.jwksUri), { fetch: safeFetch })
  return async (input) => {
    try {
      const result = await jwtVerify(input.idToken, jwks, {
        issuer: config.issuer,
        audience: config.clientId,
        nonce: input.nonce,
        algorithms: ["RS256", "ES256"]
      })
      return parseVerifiedClaims(result.payload, config)
    } catch (error) {
      if (error instanceof AuthSessionError) {
        throw error
      }
      throw new AuthSessionError("OIDC_ID_TOKEN_INVALID", 502)
    }
  }
}

function parseTokenSet(value: unknown): OidcTokenSet {
  if (!isRecord(value)) {
    throw new AuthSessionError("OIDC_INVALID_RESPONSE", 502)
  }
  const accessToken = text(value.access_token)
  const idToken = text(value.id_token)
  const tokenType = text(value.token_type)
  const expiresIn = value.expires_in
  const refreshToken = value.refresh_token === undefined ? undefined : text(value.refresh_token)
  if (
    !accessToken ||
    !idToken ||
    tokenType.toLowerCase() !== "bearer" ||
    !Number.isInteger(expiresIn) ||
    (expiresIn as number) < 1 ||
    (expiresIn as number) > 86_400
  ) {
    throw new AuthSessionError("OIDC_INVALID_RESPONSE", 502)
  }
  return {
    accessToken,
    idToken,
    tokenType: "Bearer",
    expiresIn: expiresIn as number,
    ...(refreshToken ? { refreshToken } : {})
  }
}

function parseVerifiedClaims(payload: JWTPayload, config: OidcClientConfig): VerifiedIdToken {
  const issuer = text(payload.iss)
  const subject = text(payload.sub)
  const nonce = text(payload.nonce)
  const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud
  if (
    issuer !== config.issuer ||
    subject.length < 1 ||
    subject.length > 512 ||
    nonce.length < 1 ||
    typeof audience !== "string" ||
    audience !== config.clientId
  ) {
    throw new AuthSessionError("OIDC_ID_TOKEN_INVALID", 502)
  }
  return {
    issuer,
    subject,
    audience,
    nonce,
    roles: canonicalRoles(payload.roles)
  }
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
