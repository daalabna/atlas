import {
  MutationRequestSchema,
  MutationResponseSchema,
  type MutationRequestDTO,
  type MutationResponseDTO,
} from '@atlas/contracts'
import { requestValidated, type HttpClient } from './client'

export const createMutationsApi = (http: HttpClient) => {
  return {
    async apply(
      datasetId: string,
      mutation: MutationRequestDTO,
      extra?: {
        simulate?: 'conflict' | 'error' | 'slow'
        size?: number
      },
    ): Promise<MutationResponseDTO> {
      const body = MutationRequestSchema.parse(mutation)
      const params = new URLSearchParams()
      if (extra?.simulate) params.set('simulate', extra.simulate)
      if (extra?.size) params.set('size', String(extra.size))
      const query = params.toString() ? `?${params.toString()}` : ''
      return requestValidated(
        http,
        `/api/datasets/${encodeURIComponent(datasetId)}/mutations${query}`,
        MutationResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
    },
  }
}
