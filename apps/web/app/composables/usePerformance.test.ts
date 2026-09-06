import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePerformance } from './usePerformance'

describe('usePerformance', () => {
  afterEach(() => {
    usePerformance().stop()
    vi.unstubAllGlobals()
  })

  it('records the combined filter and sort duration once', () => {
    const performance = usePerformance()

    performance.record('filter-sort', 12.5)

    expect(performance.metrics.filterSortMs).toBe(12.5)
    expect(performance.metrics).not.toHaveProperty('filterMs')
    expect(performance.metrics).not.toHaveProperty('sortMs')
  })

  it('pause does not drop consumers so resume restarts the loop', () => {
    const raf = vi.fn().mockReturnValue(1)
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const performance = usePerformance()
    performance.start()
    expect(raf).toHaveBeenCalledOnce()
    performance.pause()
    expect(cancel).toHaveBeenCalledOnce()
    performance.resume()
    expect(raf).toHaveBeenCalledTimes(2)
    performance.stop()
  })
})

