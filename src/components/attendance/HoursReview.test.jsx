/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/attendanceService', () => ({
  loadAttendanceEntries: vi.fn(async () => []),
  loadAttendanceBreaks: vi.fn(async () => []),
  reviewEntry: vi.fn(async () => ({})),
  reviewBulkApprove: vi.fn(async () => ({ approved: 1, skipped: 1 })),
  reviewReopen: vi.fn(async () => ({})),
  editEntry: vi.fn(async () => ({})),
}))

import { HoursReview } from './HoursReview'
import { reviewEntry } from '../../services/attendanceService'

const fixture = {
  range: 'today',
  entries: [
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
    },
    {
      id: 'e2',
      personName: 'Alex',
      member_id: 'm-alex',
      work_date: '2026-11-25',
      clock_in_at: '2026-11-25T16:00:00Z',
      clock_out_at: null,
      is_unscheduled: false,
      shift_id: 'shift-1',
      review_status: 'pending',
      scheduledLabel: '18:00–00:00',
    },
  ],
}

function renderReview(extra = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(HoursReview, {
      fixture,
      timeZone: 'UTC',
      actorMemberId: 'm-owner',
      isOwner: true,
      now: new Date('2026-11-25T18:00:00Z'),
      ...extra,
    }))
  })
  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('Hours review screen', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows a pending unscheduled row and blocks approval without a clock-out', () => {
    const view = renderReview()
    const chips = [...view.container.querySelectorAll('.hours-review-status button')]
    expect(chips).toHaveLength(4)
    expect(chips[0].querySelector('.hours-review-count')?.textContent).toBe('2')
    expect(chips[1].querySelector('.hours-review-count')).toBeNull()
    expect(chips[2].querySelector('.hours-review-count')).toBeNull()
    expect(view.container.querySelector('.hours-review-range')?.getAttribute('aria-haspopup')).toBe('dialog')
    expect(view.container.textContent).not.toContain('This week')
    expect(view.container.textContent).toContain('Nina')
    expect(view.container.textContent).toContain('Unscheduled')
    expect(view.container.textContent).toContain('Missing clock-out')
    const approve = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Approve' && button.disabled)
    expect(approve).toBeTruthy()
    view.unmount()
  })

  it('asks for a note before declining', () => {
    const view = renderReview()
    const decline = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Decline' && !button.disabled)
    act(() => { decline.click() })
    expect(view.container.textContent).toContain('Decline hours')
    const form = view.container.querySelector('form')
    const note = form.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    act(() => {
      setter.call(note, 'Not on the rota')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(reviewEntry).toHaveBeenCalledWith(expect.objectContaining({
      entryId: 'e1',
      approve: false,
      note: 'Not on the rota',
    }))
    view.unmount()
  })

  it('shows approved hours and waiting hours for the month', () => {
    const view = renderReview({
      fixture: {
        range: 'month',
        month: '2026-11',
        entries: [
          { ...fixture.entries[0], review_status: 'pending' },
          { ...fixture.entries[1], id: 'e3', clock_out_at: '2026-11-25T22:00:00Z', review_status: 'approved' },
          { ...fixture.entries[1], id: 'e4', personName: 'Alex', clock_out_at: '2026-11-20T22:00:00Z', work_date: '2026-11-20', review_status: 'declined' },
        ],
      },
    })
    expect(view.container.textContent).toContain('Approved hours')
    expect(view.container.textContent).toContain('Alex')
    expect(view.container.textContent).toContain('waiting')
    expect(view.container.querySelector('.hours-review-table')).toBeTruthy()
    view.unmount()
  })
})
