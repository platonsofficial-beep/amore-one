import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveEmployeeShiftAdjust } from './scheduleEmployeeDayAdjust'

const morning = { id: 'morning', templateId: 'morning', name: 'Morning', startTime: '08:30', endTime: '16:30', defaultArea: 'Service' }
const evening = { id: 'evening', templateId: 'evening', name: 'Evening', startTime: '16:30', endTime: '00:30', defaultArea: 'Service' }

function cell(shifts = []) {
  return { shifts, assignedCount: shifts.length, requiredCount: 1 }
}

describe('resolveEmployeeShiftAdjust', () => {
  it('assigns an unassigned employee to the tapped shift only', () => {
    const decision = resolveEmployeeShiftAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-11',
      template: evening,
      cell: cell(),
      shifts: [],
    })
    expect(decision.action).toBe('assign')
    expect(decision.template.name).toBe('Evening')
    expect(decision.dayKey).toBe('2026-11-11')
  })

  it('moves one existing shift onto the tapped shift', () => {
    const decision = resolveEmployeeShiftAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-11',
      template: evening,
      cell: cell(),
      shifts: [{ id: 'shift-1', employeeId: 'ana', date: '2026-11-09', shiftTemplateId: 'morning', startTime: '08:30' }],
    })
    expect(decision.action).toBe('move')
    expect(decision.shiftId).toBe('shift-1')
    expect(decision.template.name).toBe('Evening')
  })

  it('moves the matching service when the employee already has two shifts', () => {
    const decision = resolveEmployeeShiftAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-13',
      template: evening,
      cell: cell(),
      shifts: [
        { id: 'm', employeeId: 'ana', date: '2026-11-09', shiftTemplateId: 'morning', startTime: '08:30' },
        { id: 'e', employeeId: 'ana', date: '2026-11-09', shiftTemplateId: 'evening', startTime: '16:30' },
      ],
    })
    expect(decision.action).toBe('move')
    expect(decision.shiftId).toBe('e')
  })

  it('does not render a Remaining row on the assign card', () => {
    const source = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    const start = source.indexOf('<h3>{t("Assign employees")}</h3>')
    const slice = source.slice(start, start + 4500)
    expect(slice).not.toContain('Remaining')
    expect(slice).toContain('Required')
    expect(slice).toContain('Selected')
  })

  it('assigns from the tapped shift and leaves the day header alone', () => {
    const source = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
    const headerAt = source.indexOf('className="blend-grid-header-day-select"')
    const header = source.slice(headerAt, headerAt + 420)
    expect(header).not.toContain('handleAssignFocusedEmployeeToShift')
    expect(header).not.toContain('handleOpenAssignmentModal')
    const plusAt = source.indexOf('aria-label={t("Add employee")}')
    const plus = source.slice(plusAt - 700, plusAt)
    expect(plus).toContain('focusedEmployeeId')
    expect(plus).toContain('handleAssignFocusedEmployeeToShift')
    expect(plus).toContain('handleOpenAssignmentModal')
  })

  it('does nothing when they are already on the tapped shift', () => {
    const decision = resolveEmployeeShiftAdjust({
      employeeId: 'ana',
      dayKey: '2026-11-11',
      template: morning,
      cell: cell([{ employeeId: 'ana' }]),
      shifts: [{ id: 'shift-1', employeeId: 'ana', date: '2026-11-11', shiftTemplateId: 'morning', startTime: '08:30' }],
    })
    expect(decision.action).toBe('noop')
  })
})
