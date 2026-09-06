export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export class VersionConflictError extends ApiClientError {
  constructor(
    readonly currentVersion: number,
    readonly serverValue: unknown,
    body: unknown,
  ) {
    super('VERSION_CONFLICT', 409, body)
    this.name = 'VersionConflictError'
  }
}

/** JSON value from `response.json()` before Zod validation. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface HttpClient {
  request(path: string, init?: RequestInit): Promise<JsonValue>
}

export interface JsonSchema<T> {
  parse: (value: unknown) => T
}

/** Fetch + Zod-parse in one step — preferred for API modules. */
export const requestValidated = async <T>(
  http: HttpClient,
  path: string,
  schema: JsonSchema<T>,
  init?: RequestInit,
): Promise<T> => {
  const payload = await http.request(path, init)
  try {
    return schema.parse(payload)
  } catch (error) {
    throw new ApiClientError(
      error instanceof Error ? error.message : 'Invalid response payload',
      422,
      error,
    )
  }
}

/** Nitro/h3 wraps the real payload in `data`; ofetch may already unwrap it. */
export const unwrapErrorBody = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') return {}
  const record = payload as Record<string, unknown>
  if (record.data && typeof record.data === 'object') return record.data as Record<string, unknown>
  return record
}

export const errorFromHttpFailure = (
  status: number,
  payload: unknown,
  fallbackMessage?: string,
): ApiClientError => {
  const body = unwrapErrorBody(payload)
  if (status === 409) {
    return new VersionConflictError(Number(body.currentVersion ?? 0), body.serverValue, body)
  }
  return new ApiClientError(
    String(body.message ?? fallbackMessage ?? `HTTP ${status}`),
    status,
    body,
  )
}

export const createHttpClient = (baseUrl = ''): HttpClient => {
  return {
    async request(path: string, init?: RequestInit): Promise<JsonValue> {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw errorFromHttpFailure(response.status, payload)
      return payload as JsonValue
    },
  }
}
