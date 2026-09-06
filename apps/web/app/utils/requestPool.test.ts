import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestPool } from './requestPool'

describe('RequestPool', () => {
  afterEach(() => vi.useRealTimers())

  it('times out a silent request and rejects every request during recovery', async () => {
    vi.useFakeTimers()
    const pool = new RequestPool<string>()
    const timeoutError = new Error('timed out')
    const first = new Promise<string>((resolve, reject) => {
      pool.add('first', resolve, reject, 100, () => pool.rejectAll(timeoutError))
    })
    const second = new Promise<string>((resolve, reject) => {
      pool.add('second', resolve, reject, 100, () => pool.rejectAll(timeoutError))
    })
    const assertions = Promise.all([
      expect(first).rejects.toThrow('timed out'),
      expect(second).rejects.toThrow('timed out'),
    ])

    await vi.advanceTimersByTimeAsync(100)

    await assertions
  })

  it('clears the timeout after a response', async () => {
    vi.useFakeTimers()
    const pool = new RequestPool<string>()
    const onTimeout = vi.fn()
    const request = new Promise<string>((resolve, reject) => {
      pool.add('request', resolve, reject, 100, onTimeout)
    })

    expect(pool.resolve('request', 'ok')).toBe(true)
    await expect(request).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(100)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('rejects duplicate request ids without replacing the original request', async () => {
    vi.useFakeTimers()
    const pool = new RequestPool<string>()
    const first = new Promise<string>((resolve, reject) => {
      pool.add('same-id', resolve, reject, 100, () => pool.rejectAll(new Error('timed out')))
    })

    expect(() => {
      pool.add('same-id', () => undefined, () => undefined, 100, () => undefined)
    }).toThrow('Duplicate request id')

    expect(pool.resolve('same-id', 'original')).toBe(true)
    await expect(first).resolves.toBe('original')
  })
})
