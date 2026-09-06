import { ViewSchema, type ViewDTO } from '@atlas/contracts'
import { z } from 'zod'
import { requestValidated, type HttpClient } from './client'
import { withSize } from './url'

const ViewsResponseSchema = z.object({
  views: z.array(ViewSchema),
})

export const createViewsApi = (http: HttpClient) => {
  return {
    async list(datasetId: string, size?: number): Promise<ViewDTO[]> {
      const payload = await requestValidated(
        http,
        withSize(`/api/datasets/${encodeURIComponent(datasetId)}/views`, size),
        ViewsResponseSchema,
      )
      return payload.views
    },
  }
}
