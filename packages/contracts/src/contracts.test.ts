import { describe, expect, it } from 'vitest'
import {
  DatasetSchema,
  MutationRequestSchema,
  ConflictResponseSchema,
  ViewSchema,
  ApiErrorSchema,
  RestoreRequestSchema,
} from './index'
import type { FilterDTO, ViewDTO } from './view'

describe('API contracts', () => {
  it('parses a dataset DTO and rejects a bad version', () => {
    const parsed = DatasetSchema.parse({
      id: 'customers',
      name: 'Customers',
      version: 1,
      columns: [{ id: 'name', name: 'Name', type: 'text', width: 120 }],
      rowIds: ['row-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(parsed.id).toBe('customers')
    expect(() => DatasetSchema.parse({ ...parsed, version: -1 })).toThrow()
  })

  it('accepts an update-cell mutation and a 409 contract', () => {
    const mutation = MutationRequestSchema.parse({
      type: 'update-cell',
      rowId: 'row-1',
      columnId: 'name',
      value: 'Alex',
      expectedVersion: 1,
    })
    expect(mutation.type).toBe('update-cell')
    expect(
      ConflictResponseSchema.parse({
        code: 'VERSION_CONFLICT',
        currentVersion: 2,
        serverValue: 'John',
        message: 'conflict',
      }).code,
    ).toBe('VERSION_CONFLICT')
  })

  it('rejects delete-rows with an empty id list', () => {
    expect(() =>
      MutationRequestSchema.parse({
        type: 'delete-rows',
        rowIds: [],
        expectedVersion: 1,
      }),
    ).toThrow()
  })

  it('rejects update-cells with an empty cell list', () => {
    expect(() =>
      MutationRequestSchema.parse({
        type: 'update-cells',
        cells: [],
        expectedVersion: 1,
      }),
    ).toThrow()
  })

  it('rejects duplicate mutation targets', () => {
    expect(() =>
      MutationRequestSchema.parse({
        type: 'delete-rows',
        rowIds: ['row-1', 'row-1'],
        expectedVersion: 1,
      }),
    ).toThrow('Mutation targets must be unique')
  })

  it('parses view DTOs consumed by domain aliases', () => {
    const view: ViewDTO = ViewSchema.parse({
      id: 'active',
      name: 'Active users',
      filters: [{ id: 'f1', columnId: 'status', operator: 'equals', value: 'active' }],
      sorting: [{ columnId: 'score', direction: 'desc' }],
      visibleColumns: ['name', 'status'],
      columnWidths: { name: 180 },
    })
    const dto: ViewDTO = view
    const filter: FilterDTO = view.filters[0]!
    expect(dto.id).toBe('active')
    expect(filter.operator).toBe('equals')
  })

  it('rejects restore targetVersion below 1', () => {
    expect(() =>
      RestoreRequestSchema.parse({ targetVersion: 0, expectedVersion: 3 }),
    ).toThrow()
    expect(
      RestoreRequestSchema.parse({ targetVersion: 1, expectedVersion: 3 }).targetVersion,
    ).toBe(1)
  })

  it('parses RESTORE_INCOMPLETE as an API error code', () => {
    expect(
      ApiErrorSchema.parse({
        code: 'RESTORE_INCOMPLETE',
        message: 'Cannot restore to v2: mutation log is incomplete',
      }).code,
    ).toBe('RESTORE_INCOMPLETE')
  })
})
