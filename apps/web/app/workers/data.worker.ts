import { runWorkerJob, type WorkerPayload } from '@atlas/workers'

self.onmessage = (event: MessageEvent<WorkerPayload>) => {
  ;(self as DedicatedWorkerGlobalScope).postMessage(runWorkerJob(event.data))
}
