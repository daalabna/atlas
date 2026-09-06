import type { MutationRequestDTO } from '@atlas/contracts'

/** Valid mutation before HTTP concurrency and idempotency metadata are attached. */
export type MutationDraft = {
  [K in MutationRequestDTO['type']]: Omit<
    Extract<MutationRequestDTO, { type: K }>,
    'expectedVersion' | 'mutationId'
  >
}[MutationRequestDTO['type']]
