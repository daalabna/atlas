import { RestoreRequestSchema } from '@atlas/contracts'
import { getOrCreateDataset, restoreToVersion, snapshot } from '../../../utils/store'
import { parseDatasetQuery } from '../../../utils/query'
import { apiStatusMessage } from '../../../utils/httpError'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? 'customers'
  const query = parseDatasetQuery(getQuery(event))
  const memory = getOrCreateDataset(id, query.size)

  let body
  try {
    body = RestoreRequestSchema.parse(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: 'VALIDATION_ERROR',
      data: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Invalid restore request',
      },
    })
  }

  try {
    restoreToVersion(memory, body.targetVersion, body.expectedVersion)
    return snapshot(memory)
  } catch (error) {
    const err = error as { statusCode?: number; data?: unknown; message: string }
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: apiStatusMessage(err.statusCode),
      data: err.data ?? { code: 'INTERNAL_ERROR', message: err.message },
    })
  }
})
