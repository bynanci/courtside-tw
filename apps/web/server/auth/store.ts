import type { CanonicalRole } from "./config.ts"

export type PendingLoginTransaction = {
  state: string
  nonce: string
  codeVerifier: string
  returnTo: string
  createdAt: number
  expiresAt: number
}

export type StoredSession = {
  sessionId: string
  subject: string
  issuer: string
  roles: readonly CanonicalRole[]
  accessToken: string
  refreshToken?: string
  createdAt: number
  rotatedAt: number
  expiresAt: number
  csrfToken: string
}

export interface AuthStore {
  saveTransaction(transaction: PendingLoginTransaction): void
  consumeTransaction(state: string, now: number): PendingLoginTransaction | null
  createSession(session: StoredSession): void
  getSession(sessionId: string): StoredSession | null
  deleteSession(sessionId: string): void
}

export class InMemoryAuthStore implements AuthStore {
  private readonly transactions = new Map<string, PendingLoginTransaction>()
  private readonly sessions = new Map<string, StoredSession>()

  saveTransaction(transaction: PendingLoginTransaction): void {
    this.transactions.set(transaction.state, transaction)
  }

  consumeTransaction(state: string, now: number): PendingLoginTransaction | null {
    const transaction = this.transactions.get(state)
    this.transactions.delete(state)
    if (!transaction || transaction.expiresAt <= now) {
      return null
    }
    return transaction
  }

  createSession(session: StoredSession): void {
    this.sessions.set(session.sessionId, session)
  }

  getSession(sessionId: string): StoredSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  expirePendingTransactions(now: number): void {
    for (const [state, transaction] of this.transactions) {
      if (transaction.expiresAt <= now) {
        this.transactions.delete(state)
      }
    }
  }
}

export function createInMemoryAuthStore(): InMemoryAuthStore {
  return new InMemoryAuthStore()
}
