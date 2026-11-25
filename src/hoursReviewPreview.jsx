import './App.css'
import './mobileShell.css'
import { HoursReview } from './components/attendance/HoursReview'

const entries = [
  {
    id: 'e1',
    personName: 'Nina',
    member_id: 'm-nina',
    work_date: '2026-11-25',
    clock_in_at: '2026-11-25T16:00:00Z',
    clock_out_at: '2026-11-25T21:30:00Z',
    is_unscheduled: true,
    shift_id: null,
    review_status: 'pending',
    scheduledLabel: 'No scheduled shift',
    reviewerName: '',
  },
  {
    id: 'e2',
    personName: 'Alex',
    member_id: 'm-alex',
    work_date: '2026-11-25',
    clock_in_at: '2026-11-25T16:05:00Z',
    clock_out_at: null,
    is_unscheduled: false,
    shift_id: 'shift-1',
    review_status: 'pending',
    is_late: true,
    late_minutes: 5,
    scheduledLabel: '18:00–00:00',
  },
]

const monthEntries = [
  entries[0],
  {
    ...entries[1],
    id: 'e3',
    clock_out_at: '2026-11-25T22:00:00Z',
    review_status: 'approved',
    reviewed_at: '2026-11-25T22:10:00Z',
    reviewerName: 'Platon',
  },
]

export function HoursReviewPreview({ shot = 'list' }) {
  const decline = shot === 'decline'
  const month = shot === 'month'
  return (
    <div className="attendance-board" style={{ padding: 16, background: 'var(--one-bg)', minHeight: '100vh' }}>
      <HoursReview
        timeZone="Europe/Nicosia"
        isOwner
        actorMemberId="m-owner"
        now={new Date('2026-11-25T20:00:00Z')}
        fixture={{
          range: month ? 'month' : 'today',
          month: '2026-11',
          openDecline: decline,
          entries: month ? monthEntries : entries,
        }}
      />
    </div>
  )
}
