export type AuthErrorCode =
  | "AUTHENTICATION_UNAVAILABLE"
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_REQUEST_INVALID"
  | "CSRF_INVALID"
  | "OIDC_INVALID_RESPONSE"
  | "OIDC_TOKEN_EXCHANGE_FAILED"
  | "OIDC_TOKEN_REVOCATION_FAILED"
  | "OIDC_ID_TOKEN_INVALID"
  | "OIDC_ROLE_INVALID"
  | "SESSION_INVALID"
  | "SESSION_STORE_UNAVAILABLE"

const PUBLIC_MESSAGES: Record<AuthErrorCode, string> = {
  AUTHENTICATION_UNAVAILABLE: "Authentication is temporarily unavailable.",
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  AUTHORIZATION_REQUEST_INVALID: "The authentication request is invalid.",
  CSRF_INVALID: "The security token is invalid.",
  OIDC_INVALID_RESPONSE: "The identity provider returned an invalid response.",
  OIDC_TOKEN_EXCHANGE_FAILED: "The identity provider could not complete sign-in.",
  OIDC_TOKEN_REVOCATION_FAILED: "Authentication is temporarily unavailable.",
  OIDC_ID_TOKEN_INVALID: "The identity provider returned an invalid identity.",
  OIDC_ROLE_INVALID: "The identity provider returned an invalid role claim.",
  SESSION_INVALID: "The session is invalid or expired.",
  SESSION_STORE_UNAVAILABLE: "Authentication is temporarily unavailable."
}

export class AuthSessionError extends Error {
  readonly code: AuthErrorCode
  readonly status: number
  readonly publicMessage: string

  constructor(code: AuthErrorCode, status: number = 400) {
    super(PUBLIC_MESSAGES[code])
    this.name = "AuthSessionError"
    this.code = code
    this.status = status
    this.publicMessage = PUBLIC_MESSAGES[code]
  }
}

export function isAuthSessionError(value: unknown): value is AuthSessionError {
  return value instanceof AuthSessionError
}
