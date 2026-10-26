import { describe, expect, it } from 'vitest'
import {
  buildScheduleDayWarnings,
  buildScheduleWeekShiftStats,
  countScheduleRosterEmployees,
} from './scheduleInsights'

describe('schedule insights counts', () => {
  it('counts the workspace roster, not only people with a shift that day-matches exactly', () => {
    const employees = Array.from({ length: 9 }, (_, index) => ({ id: `emp-${index}` }))
    const weekDays = [{ key: '2026-10-26', label: 'Mon' }]
    const shifts = [{
      employeeId: 'emp-1',
      date: '2026-10-26T00:00:00.000Z',
      startMinutes: 9 * 60,
      endMinutes: 17 * 60,
    }]

    expect(countScheduleRosterEmployees(employees)).toBe(9)
    const stats = buildScheduleWeekShiftStats(shifts, weekDays)
    expect(stats.shiftCount).toBe(1)
    expect(stats.scheduledEmployeeCount).toBe(1)
    expect(stats.scheduledEmployeeCount).not.toBe(countScheduleRosterEmployees(employees))
  })

  it('explains each warning day instead of returning a bare count', () => {
    const weekDays = [
      { key: '2026-10-26', label: 'Mon' },
      { key: '2026-10-27', label: 'Tue' },
    ]
    const rows = [{
      template: { name: 'Dinner' },
      dayCells: [
        { day: weekDays[0], assignedCount: 0, requiredCount: 2, hasRealConflict: false },
        { day: weekDays[1], assignedCount: 2, requiredCount: 2, hasRealConflict: true },
      ],
    }]

    const warnings = buildScheduleDayWarnings(weekDays, rows)
    expect(warnings).toEqual([
      { id: '2026-10-26', label: 'Mon', detail: 'Dinner needs 2 more' },
      { id: '2026-10-27', label: 'Tue', detail: 'Dinner has a scheduling conflict' },
    ])
  })
})
