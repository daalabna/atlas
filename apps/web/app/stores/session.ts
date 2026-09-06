import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
export type SimulateMode = 'none' | 'conflict' | 'error' | 'slow'
export type ConnectionStatus = 'online' | 'degraded' | 'offline'
export const useSessionStore = defineStore('session', () => {
  const user = ref({ id: 'u_demo', name: 'Daria', role: 'workspace-owner' })
  const workspaceId = ref('ws_atlas')
  const activeDatasetId = ref('customers')
  const datasetSize = ref(10000)
  const connectionStatus = ref<ConnectionStatus>('online')
  const simulate = ref<SimulateMode>('none')
  const notice = ref<string | null>(null)
  const writeLocks = new Set<symbol>()
  const writeLockCount = ref(0)
  const writesBlocked = computed(() => writeLockCount.value > 0)
  const workspaceLoadTokens = new Set<symbol>()
  const workspaceLoadCount = ref(0)
  const workspaceLoading = computed(() => workspaceLoadCount.value > 0)
  let noticeTimer: number | null = null
  const flash = (message: string) => {
    notice.value = message
    if (typeof window === 'undefined') return
    if (noticeTimer !== null) window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => {
      notice.value = null
      noticeTimer = null
    }, 3200)
  }
  const beginWriteLock = () => {
    const token = Symbol('write-lock')
    writeLocks.add(token)
    writeLockCount.value = writeLocks.size
    return token
  }
  const endWriteLock = (token: symbol) => {
    writeLocks.delete(token)
    writeLockCount.value = writeLocks.size
  }
  const beginWorkspaceLoad = () => {
    const token = Symbol('workspace-load')
    workspaceLoadTokens.add(token)
    workspaceLoadCount.value = workspaceLoadTokens.size
    return token
  }
  const endWorkspaceLoad = (token: symbol) => {
    workspaceLoadTokens.delete(token)
    workspaceLoadCount.value = workspaceLoadTokens.size
  }
  return {
    user,
    workspaceId,
    activeDatasetId,
    datasetSize,
    connectionStatus,
    simulate,
    notice,
    writesBlocked,
    workspaceLoading,
    flash,
    beginWriteLock,
    endWriteLock,
    beginWorkspaceLoad,
    endWorkspaceLoad,
  }
})
