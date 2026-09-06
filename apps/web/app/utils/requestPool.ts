export interface PendingRequest<Result> {
  resolve: (result: Result) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class RequestPool<Result> {
  private readonly pending = new Map<string, PendingRequest<Result>>()

  add(
    requestId: string,
    resolve: (result: Result) => void,
    reject: (error: Error) => void,
    timeoutMs: number,
    onTimeout: () => void,
  ) {
    if (this.pending.has(requestId)) {
      throw new Error(`Duplicate request id: ${requestId}`)
    }
    const timeout = setTimeout(() => {
      if (this.pending.has(requestId)) onTimeout()
    }, timeoutMs)
    this.pending.set(requestId, { resolve, reject, timeout })
  }

  resolve(requestId: string, result: Result): boolean {
    const request = this.pending.get(requestId)
    if (!request) return false
    this.pending.delete(requestId)
    clearTimeout(request.timeout)
    request.resolve(result)
    return true
  }

  rejectAll(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout)
      request.reject(error)
    }
    this.pending.clear()
  }
}
