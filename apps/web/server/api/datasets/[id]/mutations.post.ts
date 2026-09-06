import { MutationRequestSchema } from '@atlas/contracts'
import { applyMutation } from '../../../utils/applyServerMutation'
import { getOrCreateDataset } from '../../../utils/store'
import { parseDatasetQuery } from '../../../utils/query'
import { resolveMutationSimulate } from '../../../utils/simulate'
import { apiStatusMessage } from '../../../utils/httpError'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? 'customers'
  const query = parseDatasetQuery(getQuery(event))
  const simulate = resolveMutationSimulate(query.simulate)
  const memory = getOrCreateDataset(id, query.size)

  if (simulate === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200))
  if (simulate === 'error') {
    throw createError({
      statusCode: 500,
      data: { code: 'INTERNAL_ERROR', message: 'Simulated server failure' },
    })
  }

  let body
  try {
    body = MutationRequestSchema.parse(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: 'VALIDATION_ERROR',
      data: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Invalid mutation',
      },
    })
  }

  if (simulate === 'conflict') {
    throw createError({
      statusCode: 409,
      statusMessage: 'VERSION_CONFLICT',
      data: {
        code: 'VERSION_CONFLICT',
        currentVersion: memory.dataset.version,
        serverValue:
          body.type === 'update-cell' ? memory.rowsById[body.rowId]?.cells[body.columnId] : null,
        message: 'Simulated version conflict',
      },
    })
  }

  try {
    const applied = applyMutation(memory, body)
    return {
      version: applied.version,
      mutationId: applied.mutationId,
      appliedAt: applied.timestamp,
    }
  } catch (error) {
    const err = error as { statusCode?: number; data?: unknown; message: string }
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: apiStatusMessage(err.statusCode),
      data: err.data ?? { code: 'INTERNAL_ERROR', message: err.message },
    })
  }
})
