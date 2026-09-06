import { getOrCreateDataset } from '../../../utils/store'
import { parseDatasetQuery } from '../../../utils/query'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? 'customers'
  const query = parseDatasetQuery(getQuery(event))
  const memory = getOrCreateDataset(id, query.size)
  return { views: memory.views }
})
