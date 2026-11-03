import { describe, expect, it } from 'vitest'
import { resolveEmployeeTodayStatus } from './employeeTodayStatusUtils'
import { isTimelineEventCompleted } from './todayDashboardUtils'
import { buildScheduleWeekShiftStats } from './scheduleInsights'

const evening = { employeeId: 'evie', date: '2026-11-03', startTime: '18:00', endTime: '00:00' }
const status = (nowMinutes) => resolveEmployeeTodayStatus({
  employeeId: 'evie', todayKey: '2026-11-03', nowMinutes, isWeekPublished: true, publishedShifts: [evening],
}).key

describe('overnight shift 18:00–00:00 (end = next-day midnight)', () => {
  it('is upcoming at 14:34, not completed', () => {
    expect(status(14 * 60 + 34)).not.toBe('shift_completed')
    expect(status(14 * 60 + 34)).toMatch(/later|upcoming|scheduled/i)
  })
  it('is working at 20:00', () => {
    expect(status(20 * 60)).toMatch(/work|on_shift|active/i)
  })
  it('timeline does not mark it finished during the day', () => {
    expect(isTimelineEventCompleted({ type: 'shift', time: '18:00', endTime: '00:00' }, 14 * 60 + 34)).toBe(false)
  })
  it('counts its 6 hours in week stats', () => {
    const stats = buildScheduleWeekShiftStats(
      [{ employeeId: 'evie', date: '2026-11-03', startMinutes: 1080, endMinutes: 0 }],
      [{ key: '2026-11-03' }],
    )
    expect(stats.totalHours).toBe(6)
  })
})
