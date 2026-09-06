export type PatchPath = Array<string | number>
export interface Patch {
  path: PatchPath
  oldValue: unknown
  newValue: unknown
}
export const invertPatch = (patch: Patch): Patch => {
  return {
    path: patch.path,
    oldValue: patch.newValue,
    newValue: patch.oldValue,
  }
}
export const invertPatches = (patches: Patch[]): Patch[] => {
  return patches.map(invertPatch).reverse()
}
export const getAtPath = (target: unknown, path: PatchPath): unknown => {
  let current: unknown = target
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current
}

const cloneShallow = <T>(value: T): T => {
  if (Array.isArray(value)) return [...value] as T
  if (value && typeof value === 'object') return { ...(value as object) } as T
  return value
}

const isPlainObject = (value: unknown): value is Record<string | number, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Dataset-shaped state: clone `rowsById` at most once per batch. */
const isRowsByIdRoot = (
  target: unknown,
): target is Record<string, unknown> & { rowsById: Record<string, unknown> } =>
  isPlainObject(target) && isPlainObject(target.rowsById)

/**
 * Apply patches under `rowsById` / `rowIds` / `dataset` without re-spreading
 * the full row map on every path segment (critical at 100k rows).
 */
const applyRowsByIdRootPatches = <T extends Record<string, unknown>>(
  target: T & { rowsById: Record<string, unknown> },
  patches: Patch[],
): T => {
  let rowsById = target.rowsById
  let rowsCloned = false
  let next: Record<string, unknown> = target
  let rootCloned = false

  const touchRoot = () => {
    if (!rootCloned) {
      next = { ...target }
      rootCloned = true
    }
  }

  const touchRows = () => {
    touchRoot()
    if (!rowsCloned) {
      rowsById = { ...rowsById }
      next.rowsById = rowsById
      rowsCloned = true
    }
  }

  for (const patch of patches) {
    const { path, newValue } = patch
    if (path.length === 0) {
      return newValue as T
    }

    if (path[0] === 'rowsById' && typeof path[1] === 'string') {
      touchRows()
      const rowId = path[1]
      if (path.length === 2) {
        if (newValue === undefined) delete rowsById[rowId]
        else rowsById[rowId] = newValue
        continue
      }
      rowsById[rowId] = setAtPath(rowsById[rowId], path.slice(2), newValue)
      continue
    }

    if (path[0] === 'rowIds' && path.length === 1) {
      touchRoot()
      next.rowIds = newValue
      continue
    }

    if (path[0] === 'dataset') {
      touchRoot()
      next.dataset = setAtPath(next.dataset, path.slice(1), newValue)
      continue
    }

    // Unknown root key — fall back to generic walk from current next.
    // setAtPath shallow-clones the root; rowsById stays the original map unless
    // the path itself walked into it. Do not mark rows cloned in that case.
    next = setAtPath(next, path, newValue) as Record<string, unknown>
    rootCloned = true
    if (isPlainObject(next.rowsById)) {
      rowsById = next.rowsById
      rowsCloned = next.rowsById !== target.rowsById
    } else {
      rowsCloned = false
    }
  }

  return next as T
}

export const setAtPath = <T>(target: T, path: PatchPath, value: unknown): T => {
  if (path.length === 0) return value as T

  // Fast path: one row update under rowsById — clone the map once, not via nested walks.
  if (isRowsByIdRoot(target) && path[0] === 'rowsById' && typeof path[1] === 'string') {
    const rowId = path[1]
    const rowsById = target.rowsById
    const rest = path.slice(2)
    const nextRows = { ...rowsById }
    if (rest.length === 0) {
      if (value === undefined) delete nextRows[rowId]
      else nextRows[rowId] = value
    } else {
      nextRows[rowId] = setAtPath(rowsById[rowId], rest, value)
    }
    return { ...target, rowsById: nextRows } as T
  }

  const cloneRoot = cloneShallow(target)
  let cursor: unknown = cloneRoot
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    const parent = cursor as Record<string | number, unknown>
    const next = cloneShallow(parent[key])
    parent[key] = next
    cursor = next
  }
  const last = path[path.length - 1]!
  const parent = cursor as Record<string | number, unknown>
  // `undefined` means remove the key (used for insert/delete row structural patches).
  if (value === undefined) delete parent[last]
  else parent[last] = value
  return cloneRoot
}

export const applyPatches = <T>(target: T, patches: Patch[]): T => {
  if (patches.length === 0) return target
  if (isRowsByIdRoot(target)) {
    return applyRowsByIdRootPatches(target, patches)
  }
  let next = target
  for (const patch of patches) {
    next = setAtPath(next, patch.path, patch.newValue)
  }
  return next
}
