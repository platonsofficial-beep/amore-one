import { describe, expect, it } from 'vitest'
import {
  STORAGE_PAR_UNAVAILABLE_MESSAGE,
  countBelowParByStorage,
  formatItemsBelowPar,
  isBelowStoragePar,
  isStockStorageParSchemaMissing,
  parseStorageParInput,
  storageParShort,
} from './stockStoragePar.js'

describe('parseStorageParInput', () => {
  it('treats blank as clear and keeps zero as a par', () => {
    expect(parseStorageParInput('  ')).toEqual({ ok: true, clear: true, value: null })
    expect(parseStorageParInput('0')).toEqual({ ok: true, clear: false, value: 0 })
    expect(parseStorageParInput('1,5')).toEqual({ ok: true, clear: false, value: 1.5 })
    expect(parseStorageParInput('1.2345').ok).toBe(false)
    expect(parseStorageParInput('-1').ok).toBe(false)
  })
})

describe('storageParShort', () => {
  it('uses only the shelf par and counts a missing balance as zero', () => {
    expect(storageParShort(null, 4)).toBeNull()
    expect(storageParShort(10, 9)).toBe(1)
    expect(storageParShort(10, undefined)).toBe(10)
    expect(storageParShort(0, 4)).toBe(0)
    expect(isBelowStoragePar(10, 9)).toBe(true)
    expect(isBelowStoragePar(0, 0)).toBe(false)
    expect(isBelowStoragePar(null, 0)).toBe(false)
  })
})

describe('countBelowParByStorage', () => {
  it('counts each shelf separately and skips untracked items', () => {
    const counts = countBelowParByStorage({
      balances: [
        { workspace_storage_id: 'soft', stock_item_id: 'cola', quantity: 9 },
        { workspace_storage_id: 'spirits', stock_item_id: 'vodka', quantity: 4 },
      ],
      pars: [
        { workspace_storage_id: 'soft', stock_item_id: 'cola', par_quantity: 10 },
        { workspace_storage_id: 'soft', stock_item_id: 'tonic', par_quantity: 1 },
        { workspace_storage_id: 'spirits', stock_item_id: 'vodka', par_quantity: 4 },
      ],
    })
    expect(counts.get('soft')).toBe(2)
    expect(counts.get('spirits')).toBeUndefined()
    expect(formatItemsBelowPar(1)).toBe('1 item below par')
    expect(formatItemsBelowPar(2)).toBe('2 items below par')
  })
})

describe('isStockStorageParSchemaMissing', () => {
  it('matches a missing par table and ignores other failures', () => {
    expect(isStockStorageParSchemaMissing({
      code: 'PGRST205',
      message: "Could not find the table 'public.stock_item_storage_pars' in the schema cache",
    })).toBe(true)
    expect(isStockStorageParSchemaMissing({ message: 'permission denied' })).toBe(false)
    expect(STORAGE_PAR_UNAVAILABLE_MESSAGE).toMatch(/On hand still shows/)
  })
})
