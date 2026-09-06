import type { WorkerPayload, WorkerResult } from '@atlas/workers'
import { RequestPool } from './requestPool'

export interface DataWorkerLike {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResult>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  postMessage(payload: WorkerPayload): void
  terminate(): void
}

export type WorkerRequest = WorkerPayload extends infer Payload
  ? Payload extends WorkerPayload
    ? Omit<Payload, 'requestId'>
    : never
  : never

export const createWorkerRuntime = (
  createWorker: () => DataWorkerLike | null,
  timeoutMs: number,
) => {
  let current: DataWorkerLike | null = null
  const requests = new RequestPool<WorkerResult>()
  const resetListeners = new Set<() => void>()

  const reset = (error: Error, expectedWorker?: DataWorkerLike) => {
    if (expectedWorker && current !== expectedWorker) return false
    const worker = current
    requests.rejectAll(error)
    worker?.terminate()
    current = null
    if (!worker) return false
    for (const listener of resetListeners) {
      try {
        listener()
      } catch {
        // Cache invalidation in one consumer must not block the others.
      }
    }
    return true
  }

  const ensure = () => {
    if (current) return current
    const worker = createWorker()
    if (!worker) return null
    current = worker
    worker.addEventListener('message', (event) => {
      if (current !== worker || !event.data.requestId) return
      requests.resolve(event.data.requestId, event.data)
    })
    worker.addEventListener('error', (event) => {
      reset(new Error(event.message || 'Worker error'), worker)
    })
    return worker
  }

  const post = (payload: WorkerRequest): Promise<WorkerResult> => {
    const worker = ensure()
    if (!worker) return Promise.reject(new Error('Worker unavailable'))
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      requests.add(requestId, resolve, reject, timeoutMs, () => {
        reset(new Error(`Worker request timed out after ${timeoutMs}ms`), worker)
      })
      try {
        worker.postMessage({ ...payload, requestId } satisfies WorkerPayload)
      } catch (error) {
        reset(error instanceof Error ? error : new Error('Worker postMessage failed'), worker)
      }
    })
  }

  return {
    ensure,
    post,
    reset,
    isReady: () => Boolean(current),
    onReset: (listener: () => void) => {
      resetListeners.add(listener)
      return () => resetListeners.delete(listener)
    },
  }
}
