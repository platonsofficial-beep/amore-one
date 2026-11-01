import { describe, expect, it } from 'vitest'
import { buildLiveFloorState } from './dashboardUtils'
import { formatTeamCoverageSummaryLine } from './operationalSnapshotUtils'

describe('today-manager-fix', () => {
  it('keeps the next shift start while people are already on shift', () => {
    const state = buildLiveFloorState({
      publishedShifts: [
        { id: 'a', employeeId: 'e1', date: '2026-10-30', startTime: '12:00', endTime: '17:00' },
        { id: 'b', employeeId: 'e2', date: '2026-10-30', startTime: '18:00', endTime: '02:00' },
      ],
      isWeekPublished: true,
      todayKey: '2026-10-30',
      now: new Date(2026, 9, 30, 16, 0),
    })
    expect(state.state).toBe('live')
    expect(state.onShiftCount).toBe(1)
    expect(state.nextShiftStartLabel).toBe('18:00')
  })

  it('groups uncovered shifts by area', () => {
    expect(formatTeamCoverageSummaryLine([
      { area: 'Bar', missing: 1 },
      { area: 'Bar', missing: 1 },
      { area: 'No department', missing: 1 },
    ])).toBe('3 uncovered shifts · Bar ×2, No department')
    expect(formatTeamCoverageSummaryLine([{ area: 'Bar', missing: 1 }])).toBe('1 uncovered shift · Bar')
  })
})
