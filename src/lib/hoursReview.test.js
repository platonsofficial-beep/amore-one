import { describe, expect, it } from 'vitest'
import { attendanceErrorMessage, summarizeHours } from './attendance'
import {
  approvedHoursCsv,
  filterReviewEntries,
  groupReviewDays,
  monthPersonRows,
  reviewRangeBounds,
  scheduledEntryIds,
} from './hoursReview'

const nina = {
  id: 'e1',
  member_id: 'm-nina',
  employee_id: 'emp-nina',
  personName: 'Nina',
  work_date: '2026-11-24',
  clock_in_at: '2026-11-24T16:00:00Z',
  clock_out_at: '2026-11-24T21:30:00Z',
  is_unscheduled: true,
  shift_id: null,
  review_status: 'pending',
  is_late: false,
}

const alex = {
  id: 'e2',
  member_id: 'm-alex',
  employee_id: 'emp-alex',
  personName: 'Alex',
  work_date: '2026-11-24',
  clock_in_at: '2026-11-24T16:00:00Z',
  clock_out_at: '2026-11-24T22:00:00Z',
  is_unscheduled: false,
  shift_id: 'shift-1',
  review_status: 'pending',
}

describe('hours review', () => {
  it('keeps only approved minutes in the official total', () => {
    const summary = summarizeHours({
      shifts: [],
      entries: [
        nina,
        { ...alex, review_status: 'approved' },
        { ...alex, id: 'e3', review_status: 'declined', clock_out_at: '2026-11-24T18:00:00Z' },
      ],
    })
    expect(summary.waiting).toBeGreaterThan(0)
    expect(summary.actual).toBeGreaterThan(0)
    expect(summary.actual).toBeLessThan(summary.actual + summary.waiting)
  })

  it('groups pending days and leaves unscheduled out of bulk approve', () => {
    const bounds = reviewRangeBounds({ range: 'today', now: new Date('2026-11-24T12:00:00Z'), timeZone: 'UTC' })
    const visible = filterReviewEntries([nina, alex], { status: 'pending', ...bounds })
    const days = groupReviewDays(visible)
    expect(days[0].pending).toBe(2)
    expect(scheduledEntryIds(days[0].rows, { actorMemberId: 'm-nina', isOwner: false })).toEqual(['e2'])
  })

  it('builds a month table and an approved-only csv', () => {
    const rows = monthPersonRows([
      nina,
      { ...alex, review_status: 'approved' },
      { ...alex, id: 'e3', personName: 'Alex', review_status: 'declined' },
    ])
    const alexRow = rows.find((row) => row.name === 'Alex')
    expect(alexRow.approved).toBeGreaterThan(0)
    expect(alexRow.waiting).toBe(0)
    const csv = approvedHoursCsv([{ ...alex, review_status: 'approved', clockInLabel: '18:00', clockOutLabel: '00:00' }])
    expect(csv).toContain('Alex')
    expect(csv).not.toContain('Nina')
  })

  it('hides raw database errors', () => {
    expect(attendanceErrorMessage(new Error('column review_status does not exist'))).toBe('Something went wrong. Try again.')
    expect(attendanceErrorMessage(new Error('note_required'))).toContain('note')
  })
})
