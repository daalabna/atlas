export type HealOutcome = 'committed' | 'applied-snapshot' | 'left' | 'failed'

/** Latch inactive: once the restore scope is left, it never becomes active again. */
export const createRestoreScope = (isCurrent: () => boolean) => {
  let left = false
  const scopeIsActive = () => {
    if (left) return false
    if (!isCurrent()) {
      left = true
      return false
    }
    return true
  }
  return { scopeIsActive }
}

/** Invert cancelled optimistic patches only when heal never committed a server snapshot. */
export const shouldInvertStrandedAfterHeal = (outcome: HealOutcome) => outcome === 'failed'
