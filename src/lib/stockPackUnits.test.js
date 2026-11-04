import { describe, expect, it } from 'vitest'
import { canUndoQuickTake, formatBalanceWithPack, normalizeUnitsPerPack, planQuickTake, resolveItemPack, toBaseQuantity } from './stockPackUnits'

describe('stockPackUnits', () => {
  const pack = { packUnit: 'Case', unitsPerPack: 6 }
  it('resolves a pack only when both fields are set', () => {
    expect(resolveItemPack({ pack_unit: 'Case', units_per_pack: 6 })).toEqual(pack)
    expect(resolveItemPack({ packUnit: 'Case', unitsPerPack: null })).toBeNull()
    expect(resolveItemPack({ packUnit: '', unitsPerPack: 6 })).toBeNull()
    expect(resolveItemPack({})).toBeNull()
  })
  it('rejects bad pack sizes', () => {
    expect(normalizeUnitsPerPack('0')).toBeNull()
    expect(normalizeUnitsPerPack('-2')).toBeNull()
    expect(normalizeUnitsPerPack('6,5')).toBe(6.5)
  })
  it('converts cases to bottles', () => {
    expect(toBaseQuantity(5, 'pack', pack)).toBe(30)
    expect(toBaseQuantity(5, 'unit', pack)).toBe(5)
    expect(toBaseQuantity(-1, 'pack', pack)).toBe(0)
  })
  it('plans the water example', () => {
    const plan = planQuickTake({ balance: 48, quantity: 5, mode: 'pack', pack, unit: 'Bottle' })
    expect(plan).toMatchObject({ baseQuantity: 30, after: 18, goesNegative: false, enteredLabel: '5 Cases', baseLabel: '30 Bottles' })
  })
  it('allows taking more than stock with a warning flag', () => {
    const plan = planQuickTake({ balance: 6, quantity: 2, mode: 'pack', pack, unit: 'Bottle' })
    expect(plan.after).toBe(-6)
    expect(plan.shortfall).toBe(6)
    expect(plan.goesNegative).toBe(true)
  })
  it('formats balances with packs', () => {
    expect(formatBalanceWithPack(48, 'Bottle', pack)).toBe('8 Cases · 48 Bottles')
    expect(formatBalanceWithPack(50, 'Bottle', pack)).toBe('8 Cases + 2 Bottles · 50 Bottles')
    expect(formatBalanceWithPack(1, 'Bottle', null)).toBe('1 Bottle')
    expect(formatBalanceWithPack(4, 'Bottle', pack)).toBe('4 Bottles')
  })
  it('undo window is 15 minutes', () => {
    const now = Date.now()
    expect(canUndoQuickTake(now - 14 * 60000, now)).toBe(true)
    expect(canUndoQuickTake(now - 16 * 60000, now)).toBe(false)
    expect(canUndoQuickTake('bad', now)).toBe(false)
  })
})
