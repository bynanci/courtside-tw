export type CookieOptions = {
  httpOnly?: boolean
  maxAge?: number
  secure?: boolean
  sameSite?: "Lax" | "Strict"
  path?: "/"
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  parts.push(`Path=${options.path ?? "/"}`)
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`)
  if (options.secure !== false) {
    parts.push("Secure")
  }
  if (options.httpOnly !== false) {
    parts.push("HttpOnly")
  }
  return parts.join("; ")
}

export function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) {
    return null
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) {
      continue
    }
    const key = part.slice(0, separator).trim()
    if (key !== name) {
      continue
    }
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }
  return null
}

export function parseSetCookieValue(header: string, name: string): string {
  const value = parseCookieHeader(header, name)
  if (!value) {
    throw new Error(`Set-Cookie header does not contain ${name}`)
  }
  return value
}

export function deleteCookie(name: string): string {
  return serializeCookie(name, "", { maxAge: 0 })
}
