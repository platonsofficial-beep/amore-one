import { describe, expect, it } from 'vitest'
import { filterRemovedEmployeeShifts, isRemovedEmployeeShift, setDisabledEmployeeIds } from './removedEmployeeShifts'

const today = '2026-11-03'
const opts = { todayKey: today, disabledIds: ['e-off'] }

describe('removed employee shifts', () => {
  it('hides upcoming shifts of deleted people (no employee)', () => {
    expect(isRemovedEmployeeShift({ id: 1, date: '2026-11-03', employeeId: null }, opts)).toBe(true)
    expect(isRemovedEmployeeShift({ id: 2, shift_date: '2026-11-10', employee_id: '' }, opts)).toBe(true)
  })
  it('hides upcoming shifts of disabled people (list or joined row)', () => {
    expect(isRemovedEmployeeShift({ date: '2026-11-04', employeeId: 'e-off' }, opts)).toBe(true)
    expect(isRemovedEmployeeShift({ date: '2026-11-04', employeeId: 'x', employees: { active: false } }, opts)).toBe(true)
    expect(isRemovedEmployeeShift({ date: '2026-11-04', employeeId: 'x', employees: [{ status: 'Disabled' }] }, opts)).toBe(true)
  })
  it('keeps past shifts and everyone else untouched', () => {
    expect(isRemovedEmployeeShift({ date: '2026-11-02', employeeId: null }, opts)).toBe(false)
    expect(isRemovedEmployeeShift({ date: '2026-11-02', employeeId: 'e-off' }, opts)).toBe(false)
    const list = [
      { id: 'a', date: '2026-11-05', employeeId: 'e1' },
      { id: 'b', date: '2026-11-05', employeeId: 'e-off' },
      { id: 'c', date: '2026-11-05', employeeId: null },
      { id: 'd', date: '2026-11-01', employeeId: null, employeeName: 'Maria' },
    ]
    expect(filterRemovedEmployeeShifts(list, opts).map((s) => s.id)).toEqual(['a', 'd'])
  })
  it('re-enabling restores (registry is replaced, not merged)', () => {
    setDisabledEmployeeIds(['e-off'])
    expect(isRemovedEmployeeShift({ date: '2099-01-01', employeeId: 'e-off' })).toBe(true)
    setDisabledEmployeeIds([])
    expect(isRemovedEmployeeShift({ date: '2099-01-01', employeeId: 'e-off' })).toBe(false)
  })
})
