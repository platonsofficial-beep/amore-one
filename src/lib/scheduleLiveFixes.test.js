import { describe, expect, it } from 'vitest'
import { resolveAddShiftDate } from './scheduleAddShiftDate'
import { shiftsInWeek } from './scheduleBrowseWeek'
import { buildCopyDayPayloads } from './scheduleCopyDay'
import { appendUnplacedScheduleShifts, isCustomScheduleRow } from './scheduleCustomRow'
import { assertShiftsReadyForPublish } from './shiftIntegrity'
import { sumShiftDurationHours } from './shiftHoursUtils'

const weekDays = [
  { key: '2026-10-26', label: 'Mon' },
  { key: '2026-10-27', label: 'Tue' },
  { key: '2026-10-31', label: 'Sat' },
]

describe('schedule live fixes', () => {
  it('counts overnight shifts in the weekly total', () => {
    const hours = sumShiftDurationHours([
      { startTime: '18:00', endTime: '02:00' },
      { startTime: '10:00', endTime: '18:00' },
    ])
    expect(hours).toBe(16)
  })

  it('places a custom shift on the Custom row', () => {
    const rows = appendUnplacedScheduleShifts([], {
      weekDays,
      shifts: [{
        id: 'custom-1',
        employeeId: 'emp-1',
        date: '2026-10-26T00:00:00.000Z',
        startTime: '18:00:00',
        endTime: '02:00:00',
        role: 'Bartender',
        area: 'Bar',
        shiftTemplateId: null,
      }],
      employees: [{ id: 'emp-1', name: 'Alex' }],
    })

    expect(rows).toHaveLength(1)
    expect(isCustomScheduleRow(rows[0])).toBe(true)
    expect(rows[0].dayCells[0].shifts).toHaveLength(1)
    expect(rows[0].dayCells[0].shifts[0].employeeRecord.name).toBe('Alex')
    expect(rows[0].dayCells[1].shifts).toHaveLength(0)
  })

  it('does not duplicate a shift that is already on a template row', () => {
    const placed = [{
      template: { id: 'dinner', name: 'Dinner' },
      dayCells: [{
        day: weekDays[0],
        shifts: [{ id: 'placed-1' }],
      }],
    }]
    const rows = appendUnplacedScheduleShifts(placed, {
      weekDays,
      shifts: [{ id: 'placed-1', date: '2026-10-26', startTime: '18:00', endTime: '23:00', shiftTemplateId: 'dinner' }],
    })
    expect(rows).toHaveLength(1)
  })

  it('copies a custom shift without requiring a template', () => {
    const payloads = buildCopyDayPayloads({
      targetDate: '2026-10-27',
      shiftTemplates: [],
      sourceShifts: [{
        employeeId: 'emp-1',
        startTime: '18:00',
        endTime: '02:00',
        role: 'Bartender',
        area: 'Bar',
        shiftTemplateId: null,
      }],
    })
    expect(payloads[0].shiftTemplateId).toBeNull()
    expect(payloads[0].date).toBe('2026-10-27')
  })

  it('rejects a copy before any shift is missing an employee', () => {
    expect(() => buildCopyDayPayloads({
      targetDate: '2026-10-27',
      sourceShifts: [{ startTime: '18:00', endTime: '02:00', shiftTemplateId: null }],
    })).toThrow(/employee or time/)
  })

  it('allows publish of a custom shift and rejects a broken template id', () => {
    expect(() => assertShiftsReadyForPublish([{
      employeeId: 'emp-1',
      startTime: '18:00',
      endTime: '02:00',
      shiftTemplateId: null,
    }])).not.toThrow()

    expect(() => assertShiftsReadyForPublish([{
      employeeId: 'emp-1',
      startTime: '18:00',
      endTime: '02:00',
      shiftTemplateId: 'not-a-uuid',
    }])).toThrow(/shift template reference/)
  })

  it('counts timestamped shifts in the picked week', () => {
    const found = shiftsInWeek([
      { date: '2026-10-26T00:00:00.000Z' },
      { date: '2026-11-02' },
    ], ['2026-10-26', '2026-10-27'])
    expect(found).toHaveLength(1)
  })

  it('defaults Add Shift to today when no day was clicked', () => {
    expect(resolveAddShiftDate({
      requestedDate: '',
      weekDateKeys: ['2026-10-26', '2026-10-31', '2026-11-01'],
      todayKey: '2026-10-31',
    })).toBe('2026-10-31')
  })

  it('defaults Add Shift to today when the open week starts on Saturday', () => {
    expect(resolveAddShiftDate({
      requestedDate: '',
      weekDateKeys: ['2026-10-17', '2026-10-18'],
      todayKey: '2026-10-26',
    })).toBe('2026-10-26')
  })

  it('uses the clicked day for Add Shift', () => {
    expect(resolveAddShiftDate({
      requestedDate: '2026-10-26',
      weekDateKeys: ['2026-10-26', '2026-10-31'],
      todayKey: '2026-10-31',
    })).toBe('2026-10-26')
  })
})
