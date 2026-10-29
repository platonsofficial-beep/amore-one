import { describe, expect, it } from 'vitest'
import { buildOnShiftBoard, groupOnShiftRows, onShiftGroupTone } from './onShiftNowRows'

const tz = 'Europe/Nicosia'
const now = new Date('2026-10-29T17:30:00Z') // 19:30 Nicosia
const employees = [
  { id: 'e1', full_name: 'Giorgos Papas', department: 'Bar', position: 'Bartender' },
  { id: 'e2', full_name: 'Maria Ioannou', department: 'Floor', position: 'Waiter' },
  { id: 'e3', full_name: 'Nikos Kyriakou', department: 'Floor', position: 'Host' },
  { id: 'e4', full_name: 'Eleni Christou', department: 'Kitchen', position: 'Chef' },
]
const todayShifts = [
  { id: 's1', employeeId: 'e1', date: '2026-10-29', startTime: '17:00', endTime: '01:00' },
  { id: 's2', employeeId: 'e2', date: '2026-10-29', startTime: '18:00:00', endTime: '23:00:00' },
  { id: 's3', employeeId: 'e3', date: '2026-10-29', startTime: '19:00', endTime: '23:00' },
  { id: 's4', employeeId: 'e4', date: '2026-10-29', startTime: '21:00', endTime: '23:30' },
]
const entries = [
  { id: 'a1', employee_id: 'e1', member_id: 'm1', shift_id: 's1', work_date: '2026-10-29', clock_in_at: '2026-10-29T14:50:00Z', clock_out_at: null },
  { id: 'a2', employee_id: 'e2', member_id: 'm2', work_date: '2026-10-29', clock_in_at: '2026-10-29T16:20:00Z', clock_out_at: null, is_late: true, late_minutes: 20 },
]
const breaks = [{ id: 'b1', entry_id: 'a2', start_at: '2026-10-29T17:20:00Z', end_at: null }]

describe('on shift board', () => {
  const board = buildOnShiftBoard({ entries, breaks, employees, todayShifts, now, timeZone: tz })

  it('lists clocked-in people with shift, times, break and arrival', () => {
    expect(board.counts).toEqual({ inNow: 2, onBreak: 1, notIn: 2, late: 1 })
    const [giorgos, maria] = board.inNow
    expect(giorgos).toMatchObject({ name: 'Giorgos P.', department: 'Bar', position: 'Bartender', scheduledLabel: '17:00–01:00', clockInLabel: '16:50', workedLabel: '2h 40m', onBreak: false })
    expect(giorgos.arrival).toEqual({ kind: 'early', minutes: 10 })
    expect(maria).toMatchObject({ scheduledLabel: '18:00–23:00', onBreak: true, workedLabel: '1h', arrival: { kind: 'late', minutes: 20 } })
  })

  it('marks scheduled people who have not clocked in as late or upcoming', () => {
    const byId = Object.fromEntries(board.notIn.map((row) => [row.employeeId, row]))
    expect(byId.e3).toMatchObject({ status: 'late', lateMinutes: 30 })
    expect(byId.e4).toMatchObject({ status: 'upcoming', startsInMinutes: 90 })
  })

  it('shows Unscheduled for someone clocked in without a shift', () => {
    const extra = buildOnShiftBoard({
      entries: [{ id: 'x', employee_id: 'e4', work_date: '2026-10-29', clock_in_at: '2026-10-29T17:00:00Z', clock_out_at: null }],
      employees, todayShifts: [], now, timeZone: tz,
    })
    expect(extra.inNow[0]).toMatchObject({ scheduledLabel: 'Χωρίς βάρδια', isScheduled: false })
  })

  it('groups by shift, department and name', () => {
    expect(groupOnShiftRows(board.inNow, 'shift').map((g) => [g.title, g.subtitle])).toEqual([
      ['Bartender', '17:00–01:00'], ['Waiter', '18:00–23:00'],
    ])
    expect(groupOnShiftRows(board.inNow, 'department').map((g) => g.title)).toEqual(['Bar · Bartender', 'Floor · Waiter'])
    expect(groupOnShiftRows(board.inNow, 'name')[0].rows.map((r) => r.employeeId)).toEqual(['e1', 'e2'])
    expect(onShiftGroupTone('Bar')).toBe(onShiftGroupTone('bar'))
  })
})
