import type { CellValue, Column } from '@atlas/domain'
const FIRST = [
  'Alex',
  'Jordan',
  'Sam',
  'Riley',
  'Casey',
  'Quinn',
  'Avery',
  'Morgan',
  'Taylor',
  'Jamie',
]
const LAST = [
  'Chen',
  'Patel',
  'Nguyen',
  'Rossi',
  'Khan',
  'Silva',
  'Berg',
  'Novak',
  'Okafor',
  'Ivanov',
]
const CITIES = [
  'Berlin',
  'Lisbon',
  'Austin',
  'Seoul',
  'Toronto',
  'Oslo',
  'Moscow',
  'Tokyo',
  'Milan',
  'Denver',
]
const ROLES = ['engineer', 'designer', 'ops', 'analyst', 'lead']
const STATUSES = ['active', 'inactive', 'pending']
const PRIORITIES = ['low', 'medium', 'high']
const ACTIVE_VALUES = ['yes', 'no']
export const DATASET_COLUMNS: Column[] = [
  { id: 'name', name: 'Name', type: 'text', width: 180 },
  { id: 'email', name: 'Email', type: 'text', width: 240 },
  { id: 'status', name: 'Status', type: 'select', width: 120, options: STATUSES },
  { id: 'score', name: 'Score', type: 'number', width: 100 },
  { id: 'priority', name: 'Priority', type: 'select', width: 120, options: PRIORITIES },
  { id: 'active', name: 'Active', type: 'select', width: 90, options: ACTIVE_VALUES },
  { id: 'joinedAt', name: 'Joined', type: 'date', width: 130 },
  { id: 'city', name: 'City', type: 'text', width: 130 },
  { id: 'role', name: 'Role', type: 'select', width: 130, options: ROLES },
]
const mulberry32 = (seed: number) => {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(rand: () => number, list: T[]): T => {
  const item = list[Math.floor(rand() * list.length)]
  if (item === undefined) throw new Error('pick() called with an empty list')
  return item
}
export interface GeneratedRow {
  id: string
  cells: Record<string, CellValue>
}
export const generateDataset = (size: number, seed = 42) => {
  const rand = mulberry32(seed)
  const rowIds: string[] = new Array(size)
  const rowsById: Record<string, GeneratedRow> = Object.create(null)
  for (let i = 0; i < size; i++) {
    const id = `row-${i + 1}`
    const first = pick(rand, FIRST)
    const last = pick(rand, LAST)
    const year = 2018 + Math.floor(rand() * 8)
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, '0')
    const day = String(1 + Math.floor(rand() * 28)).padStart(2, '0')
    rowIds[i] = id
    rowsById[id] = {
      id,
      cells: {
        name: `${first} ${last}`,
        email: `${first}.${last}${i}@atlas.dev`.toLowerCase(),
        status: pick(rand, STATUSES),
        score: Math.round(rand() * 1000) / 10,
        priority: pick(rand, PRIORITIES),
        active: rand() > 0.25 ? 'yes' : 'no',
        joinedAt: `${year}-${month}-${day}`,
        city: pick(rand, CITIES),
        role: pick(rand, ROLES),
      },
    }
  }
  return { rowIds, rowsById }
}
