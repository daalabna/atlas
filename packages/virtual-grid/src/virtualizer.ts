export interface VirtualizerInput {
  count: number
  rowHeight: number
  viewportHeight: number
  scrollTop: number
  overscan?: number
}
export interface VirtualWindow {
  startIndex: number
  endIndex: number
  offsetTop: number
  totalHeight: number
  visibleCount: number
}

const clampIndex = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

export const virtualizeRows = (input: VirtualizerInput): VirtualWindow => {
  const overscan = input.overscan ?? 8
  const totalHeight = Math.max(0, input.count * input.rowHeight)
  if (input.count === 0 || input.rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0, visibleCount: 0 }
  }
  const rawStart = Math.floor(input.scrollTop / input.rowHeight)
  const viewportRows = Math.max(0, Math.ceil(input.viewportHeight / input.rowHeight))
  const startIndex = clampIndex(rawStart - overscan, 0, input.count)
  const endIndex = clampIndex(rawStart + viewportRows + overscan, startIndex, input.count)
  const offsetTop = startIndex * input.rowHeight
  return {
    startIndex,
    endIndex,
    offsetTop,
    totalHeight,
    visibleCount: endIndex - startIndex,
  }
}
