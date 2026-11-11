import { describe, expect, it } from 'vitest'
import { resolveEmployeeDayAdjust } from './scheduleEmployeeDayAdjust'

const morning = { id: 'morning', templateId: 'morning', name: 'Morning', startTime: '08:30', endTime: '16:30', defaultArea: 'Service' }
const evening = { id: 'evening', templateId: 'evening', name: 'Evening', startTime: '16:30', endTime: '00:30', defaultArea: 'Service' }

function cell(dayKey, { shifts = [], assignedCount = shifts.length, requiredCount = 1 } = {}) {
  return { day: { key: dayKey }, shifts, assignedCount, requiredCount }
}

function rowsFor(dayKey, morningCell, eveningCell) {
  return [
    { template: morning, dayCells: [morningCell] },
    { template: evening, dayCells: [eveningCell] },
  ]
}

describe('resolveEmployeeDayAdjust', () => {
  it('assigns an unassigned employee to the uncovered morning shift only', () => {
    const decision = resolveEmployeeDayAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-11',
      shifts: [],
      rows: rowsFor('2026-11-11', cell('2026-11-11'), cell('2026-11-11')),
    })
    expect(decision.action).toBe('assign')
    expect(decision.template.name).toBe('Morning')
    expect(decision.dayKey).toBe('2026-11-11')
  })

  it('moves one existing shift onto the same service on the tapped day', () => {
    const decision = resolveEmployeeDayAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-11',
      shifts: [{ id: 'shift-1', employeeId: 'ana', date: '2026-11-09', shiftTemplateId: 'morning', startTime: '08:30' }],
      rows: rowsFor(
        '2026-11-11',
        cell('2026-11-11'),
        cell('2026-11-11', { shifts: [{ employeeId: 'other' }], assignedCount: 1, requiredCount: 1 }),
      ),
    })
    expect(decision.action).toBe('move')
    expect(decision.shiftId).toBe('shift-1')
    expect(decision.template.name).toBe('Morning')
  })

  it('does not assign someone who is already on that day and has no other shift to move', () => {
    const decision = resolveEmployeeDayAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-11',
      shifts: [{ id: 'shift-1', employeeId: 'ana', date: '2026-11-11', shiftTemplateId: 'morning', startTime: '08:30' }],
      rows: rowsFor(
        '2026-11-11',
        cell('2026-11-11', { shifts: [{ employeeId: 'ana' }], assignedCount: 1 }),
        cell('2026-11-11'),
      ),
    })
    expect(decision.action).toBe('noop')
  })

  it('moves only one shift when the employee works morning and evening', () => {
    const decision = resolveEmployeeDayAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-13',
      shifts: [
        { id: 'm', employeeId: 'ana', date: '2026-11-09', shiftTemplateId: 'morning', startTime: '08:30' },
        { id: 'e', employeeId: 'ana', date: '2026-11-09', shiftTemplateId: 'evening', startTime: '16:30' },
      ],
      rows: rowsFor('2026-11-13', cell('2026-11-13'), cell('2026-11-13')),
    })
    expect(decision.action).toBe('move')
    expect(decision.shiftId).toBe('m')
  })
})
