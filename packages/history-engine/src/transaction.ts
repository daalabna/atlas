import type { Patch } from './patch'

export interface Transaction {
  id: string
  patches: Patch[]
  inversePatches: Patch[]
}

export const beginTransaction = (id: string): Transaction => {
  return { id, patches: [], inversePatches: [] }
}

export const addToTransaction = (
  tx: Transaction,
  patches: Patch[],
  inversePatches: Patch[],
): Transaction => {
  return {
    id: tx.id,
    patches: [...tx.patches, ...patches],
    inversePatches: [...inversePatches, ...tx.inversePatches],
  }
}

export const transactionToEntryFields = (tx: Transaction) => {
  return {
    patches: tx.patches,
    inversePatches: tx.inversePatches,
  }
}
