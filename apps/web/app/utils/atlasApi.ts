import {
  createAtlasApi,
  errorFromHttpFailure,
  type HttpClient,
  type JsonValue,
} from '@atlas/api-client'

const parseInitBody = (body: BodyInit | null | undefined): Record<string, unknown> | undefined => {
  if (body == null) return undefined
  if (typeof body === 'string') return JSON.parse(body) as Record<string, unknown>
  return undefined
}

export type JsonRequest = (
  path: string,
  opts: {
    method: 'GET' | 'POST'
    body?: Record<string, unknown>
    headers?: Record<string, string>
  },
) => Promise<JsonValue>

/** Shared by the live `$fetch` singleton and unit tests. */
export const createNuxtHttpClient = (request: JsonRequest): HttpClient => {
  return {
    async request(path, init) {
      try {
        return await request(path, {
          method: init?.method === 'POST' ? 'POST' : 'GET',
          body: parseInitBody(init?.body),
          headers:
            init?.headers && !(init.headers instanceof Headers) && !Array.isArray(init.headers)
              ? init.headers
              : undefined,
        })
      } catch (error) {
        const fetchError = error as {
          statusCode?: number
          status?: number
          data?: unknown
          message?: string
        }
        const status = Number(fetchError.statusCode ?? fetchError.status ?? 500)
        throw errorFromHttpFailure(status, fetchError.data, fetchError.message)
      }
    },
  }
}

const apiFetch = $fetch.create({
  headers: { 'content-type': 'application/json' },
})

/** App-wide API client. Nuxt `$fetch` keeps `/api` same-origin on the client workspace. */
export const atlasApi = createAtlasApi(
  createNuxtHttpClient((path, opts) => apiFetch<JsonValue>(path, opts)),
)
