import { describe, expect, it } from 'vitest'
import {
  applyCoverageHintsToGroups,
  enrichTeamTodayGroups,
  resolveTeamMemberShiftState,
} from './teamViewUtils'
import {
  buildOperationalSnapshot,
  buildScheduleAttentionDetail,
  buildTeamTodayCoverageBreakdown,
  formatTeamCoverageSummaryLine,
} from './operationalSnapshotUtils'

const TODAY = '2026-07-08'

describe('teamViewUtils', () => {
  it('treats invalid shift times as scheduled instead of midnight', () => {
    expect(resolveTeamMemberShiftState({
      startMinutes: null,
      endMinutes: null,
      nowMinutes: 10 * 60,
    })).toMatchObject({
      shiftState: 'scheduled',
      shiftStateLabel: 'Scheduled',
    })
  })

  it('labels working, upcoming, and finished member states', () => {
    expect(resolveTeamMemberShiftState({
      startMinutes: 9 * 60,
      endMinutes: 17 * 60,
      nowMinutes: 10 * 60,
      isOnShift: true,
    })).toMatchObject({
      shiftState: 'working',
      shiftStateLabel: 'Working now',
    })

    expect(resolveTeamMemberShiftState({
      startMinutes: 14 * 60,
      endMinutes: 22 * 60,
      nowMinutes: 10 * 60,
    })).toMatchObject({
      shiftState: 'upcoming',
      shiftStateLabel: 'Starts 14:00',
    })

    expect(resolveTeamMemberShiftState({
      startMinutes: 8 * 60,
      endMinutes: 12 * 60,
      nowMinutes: 13 * 60,
    })).toMatchObject({
      shiftState: 'finished',
      shiftStateLabel: 'Finished',
    })
  })

  it('enriches team groups with member shift states', () => {
    const groups = enrichTeamTodayGroups([
      {
        department: 'Kitchen',
        members: [{
          shiftId: 's1',
          name: 'Alex',
          shiftLabel: '09:00 - 17:00',
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
        }],
      },
    ], {
      liveFloor: {
        onShift: [{ shiftId: 's1' }],
      },
      now: new Date('2026-07-08T10:00:00'),
    })

    expect(groups[0].members[0]).toMatchObject({
      shiftState: 'working',
      shiftStateLabel: 'Working now',
    })
  })

  it('applies department coverage hints from breakdown gaps', () => {
    const groups = applyCoverageHintsToGroups([
      { department: 'Kitchen', members: [] },
      { department: 'Bar', members: [] },
    ], {
      gaps: [{ area: 'Kitchen', missing: 2 }],
    })

    expect(groups[0].coverageHint).toBe('Missing 2')
    expect(groups[1].coverageHint).toBeUndefined()
  })
})

describe('operationalSnapshotUtils team coverage', () => {
  it('builds coverage breakdown with understaffed departments', () => {
    const breakdown = buildTeamTodayCoverageBreakdown({
      todayKey: TODAY,
      shifts: [
        {
          id: 'shift-1',
          date: TODAY,
          employeeId: 'emp-1',
          area: 'Kitchen',
          role: 'Chef',
          startTime: '09:00',
          endTime: '17:00',
        },
      ],
      shiftTemplates: [
        {
          id: 'template-1',
          defaultArea: 'Kitchen',
          defaultRole: 'Chef',
          startTime: '09:00',
          endTime: '17:00',
          defaultRequiredCount: 2,
        },
        {
          id: 'template-2',
          defaultArea: 'Bar',
          defaultRole: 'Bartender',
          startTime: '12:00',
          endTime: '22:00',
          defaultRequiredCount: 1,
        },
      ],
    })

    expect(breakdown.gapCount).toBe(2)
    expect(breakdown.understaffedDepartments).toEqual(['Bar', 'Kitchen'])
    expect(formatTeamCoverageSummaryLine(breakdown.gaps)).toContain('Kitchen')
  })

  it('builds schedule attention detail from gaps and named issues', () => {
    expect(buildScheduleAttentionDetail(
      {
        issues: 3,
        coverageGaps: 2,
        otherIssueLabels: ['Alex is over weekly hours'],
      },
      { gapCount: 2, summaryLine: '2 gaps · Kitchen, Bar' },
    )).toBe('2 gaps · Kitchen, Bar · Alex is over weekly hours')
  })

  it('names overtime instead of a generic other issue', () => {
    const snapshot = buildOperationalSnapshot({
      todayKey: TODAY,
      employees: [{ id: 'e1', name: 'Alex', weeklyHours: 40 }],
      shiftTemplates: [{
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Dinner',
        defaultArea: 'Service',
        startTime: '18:00',
        endTime: '22:00',
        defaultRequiredCount: 1,
      }],
      shifts: [{
        id: 's1',
        date: TODAY,
        employeeId: 'e1',
        shiftTemplateId: '11111111-1111-4111-8111-111111111111',
        startTime: '18:00',
        endTime: '23:00',
      }],
    })

    expect(snapshot.issues).toBe(1)
    expect(snapshot.coverageGaps).toBe(0)
    expect(snapshot.otherIssueLabels).toEqual(["Alex's shift runs longer than the template"])
    expect(buildScheduleAttentionDetail(snapshot, { gapCount: 0 })).toBe(
      "Alex's shift runs longer than the template",
    )
  })
})
