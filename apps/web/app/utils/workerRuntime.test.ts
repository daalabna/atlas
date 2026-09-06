import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkerPayload, WorkerResult } from '@atlas/workers'
import { createWorkerRuntime, type DataWorkerLike } from './workerRuntime'

class ControlledWorker implements DataWorkerLike {
  readonly sent: WorkerPayload[] = []
  terminated = false
  private messageListener?: (event: MessageEvent<WorkerResult>) => void
  private errorListener?: (event: ErrorEvent) => void

  addEventListener(
    type: 'message' | 'error',
    listener: ((event: MessageEvent<WorkerResult>) => void) | ((event: ErrorEvent) => void),
  ) {
    if (type === 'message') {
      this.messageListener = listener as (event: MessageEvent<WorkerResult>) => void
    } else {
      this.errorListener = listener as (event: ErrorEvent) => void
    }
  }

  postMessage(payload: WorkerPayload) {
    this.sent.push(payload)
  }

  terminate() {
    this.terminated = true
  }

  respond(result: WorkerResult) {
    this.messageListener?.({ data: result } as MessageEvent<WorkerResult>)
  }

  fail(message: string) {
    this.errorListener?.({ message } as ErrorEvent)
  }
}

describe('worker runtime recovery', () => {
  afterEach(() => vi.useRealTimers())

  it('invalidates on timeout, recreates the worker, and ignores a late old error', async () => {
    vi.useFakeTimers()
    const workers: ControlledWorker[] = []
    const runtime = createWorkerRuntime(() => {
      const worker = new ControlledWorker()
      workers.push(worker)
      return worker
    }, 100)
    const onReset = vi.fn()
    runtime.onReset(onReset)

    const timedOut = runtime.post({ kind: 'filter-sort', filters: [], sorting: [] })
    const timedOutAssertion = expect(timedOut).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await timedOutAssertion

    expect(workers[0]?.terminated).toBe(true)
    expect(onReset).toHaveBeenCalledOnce()
    expect(runtime.isReady()).toBe(false)

    const recovered = runtime.post({ kind: 'init', rowIds: [], rows: [] })
    const replacement = workers[1]!
    workers[0]?.fail('late failure')
    expect(runtime.isReady()).toBe(true)
    expect(replacement.terminated).toBe(false)

    const requestId = replacement.sent[0]?.requestId
    expect(requestId).toBeTruthy()
    replacement.respond({ kind: 'init', rowIds: [], duration: 0, requestId })
    await expect(recovered).resolves.toMatchObject({ kind: 'init', rowIds: [] })
    expect(onReset).toHaveBeenCalledOnce()
  })
})
