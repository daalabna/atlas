import { getOrCreateDataset } from '../../../utils/store'
import { parseDatasetQuery } from '../../../utils/query'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? 'customers'
  const query = parseDatasetQuery(getQuery(event))
  const memory = getOrCreateDataset(id, query.size)
  return {
    datasetId: memory.dataset.id,
    currentVersion: memory.dataset.version,
    entries: [...memory.mutations]
      .reverse()
      .slice(0, 100)
      .map((entry) => ({
        id: entry.id,
        version: entry.version,
        type: entry.type,
        summary: entry.summary,
        timestamp: entry.timestamp,
        mutationId: entry.mutationId,
      })),
  }
})
