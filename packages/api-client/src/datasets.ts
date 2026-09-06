import {
  DatasetSnapshotSchema,
  type DatasetSnapshotDTO,
  VersionHistorySchema,
  type VersionHistoryDTO,
  RestoreRequestSchema,
} from '@atlas/contracts'
import { requestValidated, type HttpClient } from './client'
import { withSize } from './url'

export const createDatasetsApi = (http: HttpClient) => {
  return {
    async getSnapshot(id: string, size?: number): Promise<DatasetSnapshotDTO> {
      return requestValidated(
        http,
        withSize(`/api/datasets/${encodeURIComponent(id)}`, size),
        DatasetSnapshotSchema,
      )
    },
    async getHistory(id: string, size?: number): Promise<VersionHistoryDTO> {
      return requestValidated(
        http,
        withSize(`/api/datasets/${encodeURIComponent(id)}/history`, size),
        VersionHistorySchema,
      )
    },
    async restore(
      id: string,
      targetVersion: number,
      expectedVersion: number,
      size?: number,
    ): Promise<DatasetSnapshotDTO> {
      const body = RestoreRequestSchema.parse({ targetVersion, expectedVersion })
      return requestValidated(
        http,
        withSize(`/api/datasets/${encodeURIComponent(id)}/restore`, size),
        DatasetSnapshotSchema,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
    },
  }
}
