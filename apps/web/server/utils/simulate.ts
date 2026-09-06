/**
 * Demo fault-injection modes. Honored only outside production builds.
 */
export const resolveMutationSimulate = (
  raw: unknown,
  isProd: boolean = process.env.NODE_ENV === 'production',
): string => {
  if (isProd) return ''
  const value = String(raw ?? '')
  if (value === 'slow' || value === 'error' || value === 'conflict') return value
  return ''
}
