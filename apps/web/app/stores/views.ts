import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { View } from '@atlas/domain'
import { atlasApi } from '~/utils/atlasApi'

export const useViewsStore = defineStore('views', () => {
  const views = shallowRef<View[]>([])
  const activeViewId = shallowRef('all')
  let loadToken = 0

  const activeView = computed(
    () => views.value.find((view) => view.id === activeViewId.value) ?? null,
  )

  const loadViews = async (datasetId: string, size: number) => {
    const token = ++loadToken
    let loaded: View[]
    try {
      loaded = await atlasApi.views.list(datasetId, size)
    } catch (error) {
      if (token !== loadToken) return false
      throw error
    }
    if (token !== loadToken) return false
    views.value = loaded
    if (!views.value.some((view) => view.id === activeViewId.value)) {
      activeViewId.value = views.value[0]?.id ?? 'all'
    }
    return true
  }

  const setActiveView = (id: string) => {
    activeViewId.value = id
  }

  const reset = () => {
    loadToken += 1
    views.value = []
    activeViewId.value = 'all'
  }

  return {
    views,
    activeViewId,
    activeView,
    loadViews,
    setActiveView,
    reset,
  }
})
