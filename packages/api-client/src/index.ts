import { createHttpClient, type HttpClient } from './client'
import { createDatasetsApi } from './datasets'
import { createMutationsApi } from './mutations'
import { createViewsApi } from './views'
export const createAtlasApi = (http: HttpClient = createHttpClient()) => {
  return {
    datasets: createDatasetsApi(http),
    mutations: createMutationsApi(http),
    views: createViewsApi(http),
  }
}
export type AtlasApi = ReturnType<typeof createAtlasApi>
export * from './client'
export * from './datasets'
export * from './mutations'
export * from './views'
export * from './url'
