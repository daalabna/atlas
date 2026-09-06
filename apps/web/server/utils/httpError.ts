/** H3 statusMessage for thrown dataset API errors. */
export const apiStatusMessage = (statusCode?: number) => {
  if (statusCode === 409) return 'VERSION_CONFLICT'
  if (statusCode === 400) return 'VALIDATION_ERROR'
  if (statusCode === 404) return 'NOT_FOUND'
  return 'INTERNAL_ERROR'
}
