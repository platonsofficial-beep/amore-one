import { describe, expect, it } from 'vitest'
import {
  STAFF_SHELF_COUNT_NOTE,
  buildStaffShelfCountLines,
  formatStaffShelfCountInput,
  isStaffShelfCountable,
  parseStaffShelfCountQuantity,
  staffShelfCountPresentation,
  toStaffShelfCountRows,
} from './staffShelfCount'

const cola = {
  stockItemId: 'cola',
  name: 'Cola',
  brand: 'TEST',
  unit: 'Piece',
  quantity: 4,
  quantityVersion: 2,
  parQuantity: 6,
  active: true,
  costPrice: 3.5,
  lineValue: 14,
}

describe('staff shelf count rows', () => {
  it('drops cost and keeps a balance row countable', () => {
    const [row] = toStaffShelfCountRows([cola, {
      stockItemId: 'napkins',
      name: 'Napkins',
      quantity: 0,
      quantityVersion: 0,
      parQuantity: 2,
      active: true,
      costPrice: 1,
      lineValue: 0,
    }])

    expect(row).toEqual({
      stockItemId: 'cola',
      displayName: 'Cola',
      unit: 'Piece',
      quantity: 4,
      quantityVersion: 2,
      parQuantity: 6,
      active: true,
    })
    expect(row).not.toHaveProperty('costPrice')
    expect(row).not.toHaveProperty('lineValue')
    expect(isStaffShelfCountable(row)).toBe(true)
    expect(isStaffShelfCountable(toStaffShelfCountRows([{
      stockItemId: 'napkins',
      name: 'Napkins',
      quantityVersion: 0,
      active: true,
    }])[0])).toBe(false)
  })

  it('requires a quantity for every balance on the shelf', () => {
    const rows = toStaffShelfCountRows([cola])
    expect(parseStaffShelfCountQuantity('0').ok).toBe(true)
    expect(parseStaffShelfCountQuantity('1.25').value).toBe(1.25)
    expect(parseStaffShelfCountQuantity('-1').ok).toBe(false)
    expect(parseStaffShelfCountQuantity('1.2345').ok).toBe(false)
    expect(formatStaffShelfCountInput(4)).toBe('4')

    expect(buildStaffShelfCountLines(rows, { cola: '' }).ok).toBe(false)
    expect(buildStaffShelfCountLines(rows, { cola: '2' })).toEqual({
      ok: true,
      lines: [{ stock_item_id: 'cola', counted_quantity: 2 }],
    })
    expect(buildStaffShelfCountLines(toStaffShelfCountRows([{
      stockItemId: 'napkins',
      name: 'Napkins',
      quantityVersion: 0,
    }]), {}).error).toMatch(/balance/i)
  })

  it('labels a waiting staff session for the manager', () => {
    expect(staffShelfCountPresentation({
      note: STAFF_SHELF_COUNT_NOTE,
      status: 'counting_complete',
    })).toEqual({
      title: 'Staff shelf count',
      detail: 'Waiting for a manager to post. Stock is unchanged.',
    })
    expect(staffShelfCountPresentation({
      note: STAFF_SHELF_COUNT_NOTE,
      status: 'posted',
    })?.detail).toBe('')
    expect(staffShelfCountPresentation({ note: 'Bar count', status: 'counting_complete' })).toBeNull()
  })
})
