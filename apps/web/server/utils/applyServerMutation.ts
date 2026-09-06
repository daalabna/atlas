import type { MutationRequestDTO } from '@atlas/contracts'
import type { DatasetMemory, ServerMutation } from './store'
import { applyMutationIntent, validationError } from './serverMutationHandlers'

const versionConflict = (memory: DatasetMemory, body: MutationRequestDTO) =>
  Object.assign(new Error('VERSION_CONFLICT'), {
    statusCode: 409,
    data: {
      code: 'VERSION_CONFLICT' as const,
      currentVersion: memory.dataset.version,
      serverValue:
        body.type === 'update-cell'
          ? (memory.rowsById[body.rowId]?.cells[body.columnId] ?? null)
          : null,
      message: `Expected version ${body.expectedVersion}, server is at ${memory.dataset.version}`,
    },
  })

const findDuplicate = (memory: DatasetMemory, mutationId: string, requestFingerprint: string) => {
  const duplicate = memory.mutations.find((entry) => entry.mutationId === mutationId)
  if (duplicate && duplicate.requestFingerprint !== requestFingerprint) {
    throw validationError(`Mutation id ${mutationId} was already used for another request`)
  }
  return duplicate
}

export const applyMutation = (memory: DatasetMemory, body: MutationRequestDTO): ServerMutation => {
  const mutationId = body.mutationId ?? crypto.randomUUID()
  const { mutationId: _mutationId, expectedVersion: _expectedVersion, ...intent } = body
  const requestFingerprint = JSON.stringify(intent)
  const duplicate = findDuplicate(memory, mutationId, requestFingerprint)
  if (duplicate) return duplicate
  if (body.expectedVersion !== memory.dataset.version) throw versionConflict(memory, body)

  applyMutationIntent(memory, body, { mutationId, requestFingerprint })
  const entry = memory.mutations.at(-1)
  if (!entry) throw new Error('Mutation was not recorded')
  return entry
}
