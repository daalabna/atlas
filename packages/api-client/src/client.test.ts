import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApiClientError,
  VersionConflictError,
  createHttpClient,
  errorFromHttpFailure,
  requestValidated,
  unwrapErrorBody,
} from './client'

describe('createHttpClient', () => {
  it('throws VersionConflictError on 409', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        data: { code: 'VERSION_CONFLICT', currentVersion: 7, serverValue: 'old' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = createHttpClient('/api')
    await expect(client.request('/datasets/x/mutations', { method: 'POST' })).rejects.toBeInstanceOf(
      VersionConflictError,
    )
    await expect(client.request('/datasets/x/mutations', { method: 'POST' })).rejects.toMatchObject({
      currentVersion: 7,
      serverValue: 'old',
    })
  })

  it('throws ApiClientError on other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server exploded' }),
      }),
    )
    const client = createHttpClient()
    await expect(client.request('/boom')).rejects.toBeInstanceOf(ApiClientError)
    await expect(client.request('/boom')).rejects.toMatchObject({ status: 500 })
  })

  it('returns JSON payload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dataset: { id: 'customers' } }),
      }),
    )
    const client = createHttpClient()
    await expect(client.request('/datasets/customers')).resolves.toEqual({
      dataset: { id: 'customers' },
    })
  })

  it('requestValidated parses with schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'customers' }),
      }),
    )
    const client = createHttpClient()
    const schema = z.object({ id: z.string() })
    await expect(requestValidated(client, '/datasets/customers', schema)).resolves.toEqual({
      id: 'customers',
    })
  })

  it('requestValidated wraps Zod failures as ApiClientError 422', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1 }),
      }),
    )
    const client = createHttpClient()
    const schema = z.object({ id: z.string() })
    await expect(requestValidated(client, '/datasets/customers', schema)).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 422,
    })
  })
})

describe('errorFromHttpFailure', () => {
  it('unwraps nested h3 data for 409', () => {
    expect(
      unwrapErrorBody({ data: { currentVersion: 4, serverValue: 'x' } }),
    ).toEqual({ currentVersion: 4, serverValue: 'x' })
    const error = errorFromHttpFailure(409, {
      data: { currentVersion: 4, serverValue: 'x' },
    })
    expect(error).toBeInstanceOf(VersionConflictError)
    expect(error).toMatchObject({ currentVersion: 4, serverValue: 'x' })
  })

  it('reads a flat ofetch body for 409', () => {
    const error = errorFromHttpFailure(409, { currentVersion: 9, serverValue: null })
    expect(error).toBeInstanceOf(VersionConflictError)
    expect(error).toMatchObject({ currentVersion: 9, serverValue: null })
  })

  it('maps other statuses to ApiClientError', () => {
    const error = errorFromHttpFailure(500, { data: { message: 'boom' } }, 'fallback')
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ status: 500, message: 'boom' })
  })
})