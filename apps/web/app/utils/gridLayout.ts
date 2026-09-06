/** Sticky grid header inside the scroll viewport. Keep in lockstep with DataGrid / EditorOverlay. */
export const GRID_HEADER_HEIGHT = 36
export const GRID_OVERSCAN = 4

/** Viewport height available to virtualized rows (scrollport minus sticky header). */
export const gridBodyViewportHeight = (viewportHeight: number) =>
  Math.max(0, viewportHeight - GRID_HEADER_HEIGHT)
