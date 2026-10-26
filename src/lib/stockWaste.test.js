import { describe, expect, it } from 'vitest'
import {
  WASTE_REASONS,
  formatWasteNote,
  isWasteMovement,
  parseWasteNote,
} from './stockWaste'

describe('stock waste notes', () => {
  it('lists the waste reasons', () => {
    expect(WASTE_REASONS.map((reason) => reason.label)).toEqual([
      'Broken',
      'Spilled',
      'Expired',
      'Comp / on the house',
      'Staff drink',
      'Other',
    ])
  })

  it('formats a reason with an optional note', () => {
    expect(formatWasteNote('broken')).toBe('Waste · Broken')
    expect(formatWasteNote('other', '  guest glass  ')).toBe('Waste · Other · guest glass')
    expect(parseWasteNote('Waste · Other · guest glass')).toEqual({
      reasonLabel: 'Other',
      note: 'guest glass',
    })
  })

  it('rejects a missing reason and ignores ordinary usage', () => {
    expect(() => formatWasteNote('')).toThrow(/reason/i)
    expect(isWasteMovement({ type: 'usage', note: 'Shift use' })).toBe(false)
    expect(isWasteMovement({ type: 'usage', note: 'Waste · Spilled' })).toBe(true)
    expect(isWasteMovement({ type: 'adjustment', note: 'Waste · Spilled' })).toBe(false)
  })
})
