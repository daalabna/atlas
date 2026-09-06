import { describe, expect, it } from 'vitest'
import { booleanSelectOptions, selectOptions } from '../src/Select/options'

describe('@atlas/ui exports', () => {
  it('exposes the public module entry', async () => {
    const ui = await import('../src/index')
    expect(ui.AtlasButton).toBeTruthy()
    expect(ui.AtlasInput).toBeTruthy()
    expect(ui.AtlasSelect).toBeTruthy()
  })

  it('maps string lists to select options', () => {
    expect(selectOptions(['a', 'b'])).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ])
    expect(booleanSelectOptions()).toHaveLength(2)
  })
})
