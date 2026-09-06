import { reactive } from 'vue'

export interface ScoreAggregate {
  min: number
  max: number
  avg: number
  sum: number
}

export interface PerformanceSnapshot {
  fps: number
  gridRenderMs: number
  rowsRendered: number
  cellsRendered: number
  filterSortMs: number
  workerMs: number
  memoryMb: number | null
  score: ScoreAggregate | null
}

const state = reactive<PerformanceSnapshot>({
  fps: 0,
  gridRenderMs: 0,
  rowsRendered: 0,
  cellsRendered: 0,
  filterSortMs: 0,
  workerMs: 0,
  memoryMb: null,
  score: null,
})

let raf = 0
let consumers = 0
let frames: number[] = []
let lastPublish = 0
const marks = new Map<string, number>()

const sampleMemory = () => {
  const perf = globalThis.performance as Performance & {
    memory?: {
      usedJSHeapSize: number
    }
  }
  if (!perf.memory) return null
  return Math.round((perf.memory.usedJSHeapSize / 1024 / 1024) * 10) / 10
}

/** Count frames every rAF, but only push reactive UI updates ~4×/sec. */
const loop = (now: number) => {
  frames.push(now)
  frames = frames.filter((time) => now - time <= 1000)
  if (now - lastPublish >= 250) {
    lastPublish = now
    const nextFps = frames.length
    const nextMem = sampleMemory()
    if (state.fps !== nextFps) state.fps = nextFps
    if (state.memoryMb !== nextMem) state.memoryMb = nextMem
  }
  raf = requestAnimationFrame(loop)
}

export const usePerformance = () => {
  const start = () => {
    if (typeof requestAnimationFrame !== 'function') return
    consumers += 1
    if (!raf) raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    consumers = Math.max(0, consumers - 1)
    if (consumers > 0 || !raf) return
    cancelAnimationFrame(raf)
    raf = 0
    frames = []
    lastPublish = 0
  }
  /** Freeze the rAF loop without dropping consumers (pagehide / BFCache). */
  const pause = () => {
    if (!raf) return
    cancelAnimationFrame(raf)
    raf = 0
    frames = []
    lastPublish = 0
  }
  /** Restart the loop after pause if a consumer is still mounted. */
  const resume = () => {
    if (typeof requestAnimationFrame !== 'function' || !consumers || raf) return
    raf = requestAnimationFrame(loop)
  }
  const mark = (name: string) => {
    marks.set(name, globalThis.performance.now())
    globalThis.performance.mark?.(name)
  }
  const measure = (name: string, startMark: string, endMark: string) => {
    const from = marks.get(startMark)
    const to = marks.get(endMark) ?? globalThis.performance.now()
    if (from == null) return 0
    const duration = to - from
    if (name.includes('grid-render')) state.gridRenderMs = duration
    return duration
  }
  const record = (kind: 'filter-sort' | 'worker' | 'grid-render', duration: number) => {
    if (kind === 'filter-sort') state.filterSortMs = duration
    if (kind === 'worker') state.workerMs = duration
    if (kind === 'grid-render') state.gridRenderMs = duration
  }
  const recordRender = (rows: number, cells: number) => {
    state.rowsRendered = rows
    state.cellsRendered = cells
  }
  const recordScore = (score: ScoreAggregate | null) => {
    state.score = score
  }
  return {
    metrics: state,
    start,
    stop,
    pause,
    resume,
    mark,
    measure,
    record,
    recordRender,
    recordScore,
  }
}
