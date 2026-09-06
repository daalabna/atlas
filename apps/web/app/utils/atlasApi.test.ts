import { describe, expect, it, vi } from 'vitest'
import { ApiClientError, VersionConflictError } from '@atlas/api-client'
import { createNuxtHttpClient } from './atlasApi'

describe('createNuxtHttpClient', () => {
  it('maps ofetch 409 (nested h3 data) to VersionConflictError', async () => {
    const request = vi.fn().mockRejectedValue({
      statusCode: 409,
      data: { statusCode: 409, data: { currentVersion: 7, serverValue: 'old' } },
    })
    const client = createNuxtHttpClient(request)
    await expect(client.request('/api/datasets/x/mutations', { method: 'POST' })).rejects.toBeInstanceOf(
      VersionConflictError,
    )
    await expect(client.request('/api/datasets/x/mutations', { method: 'POST' })).rejects.toMatchObject({
      currentVersion: 7,
      serverValue: 'old',
    })
  })

  it('maps ofetch 409 (flat body) to VersionConflictError', async () => {
    const request = vi.fn().mockRejectedValue({
      status: 409,
      data: { currentVersion: 3, serverValue: null },
    })
    const client = createNuxtHttpClient(request)
    await expect(client.request('/api/datasets/x/mutations')).rejects.toMatchObject({
      name: 'VersionConflictError',
      currentVersion: 3,
    })
  })

  it('maps ofetch 500 to ApiClientError', async () => {
    const request = vi.fn().mockRejectedValue({
      statusCode: 500,
      data: { message: 'Simulated server failure' },
    })
    const client = createNuxtHttpClient(request)
    await expect(client.request('/api/boom')).rejects.toBeInstanceOf(ApiClientError)
    await expect(client.request('/api/boom')).rejects.toMatchObject({
      status: 500,
      message: 'Simulated server failure',
    })
  })

  it('returns JSON on success', async () => {
    const request = vi.fn().mockResolvedValue({ version: 4 })
    const client = createNuxtHttpClient(request)
    await expect(client.request('/api/ok')).resolves.toEqual({ version: 4 })
  })
})
