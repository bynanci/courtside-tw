import createClient, { type ClientOptions } from "openapi-fetch"
import type { paths } from "./generated/openapi.js"

export type { components, operations, paths } from "./generated/openapi.js"

export type ApiClientOptions = ClientOptions & { baseUrl: string }
export type ApiClient = ReturnType<typeof createClient<paths>>

export function createApiClient(options: ApiClientOptions): ApiClient {
  return createClient<paths>({
    credentials: "include",
    ...options
  })
}
