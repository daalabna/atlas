/** Append `?size=` / `&size=` when a dataset size override is set. */
export const withSize = (path: string, size?: number) => {
  if (size == null) return path
  const join = path.includes('?') ? '&' : '?'
  return `${path}${join}size=${size}`
}
