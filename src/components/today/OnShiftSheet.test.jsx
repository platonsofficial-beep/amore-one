/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const NOW = new Date('2026-10-29T17:30:00Z') // 19:30 Nicosia
const iso = (hh, mm) => new Date(Date.UTC(2026, 9, 29, hh - 2, mm)).toISOString()

vi.mock('../../services/attendanceService', () => ({
  attendanceRange: () => ({ fromDate: '2026-10-25', toDate: '2026-11-01' }),
  loadAttendanceSettings: async () => ({ late_grace_minutes: 10 }),
  loadAttendanceEntries: async () => [
    { id: 'a1', employee_id: 'e1', work_date: '2026-10-29', clock_in_at: iso(17, 0), clock_out_at: null },
    { id: 'a2', employee_id: 'e2', work_date: '2026-10-29', clock_in_at: iso(18, 0), clock_out_at: null },
  ],
  loadAttendanceBreaks: async () => [{ id: 'b1', entry_id: 'a2', start_at: iso(19, 10), end_at: null }],
}))
vi.mock('../identity/PersonAvatar', () => ({ PersonAvatar: ({ name }) => name.slice(0, 1) }))

const { OnShiftSheet } = await import('./OnShiftSheet')

const employees = Array.from({ length: 10 }, (_, i) => ({ id: `e${i + 1}`, full_name: `Person${i + 1} Surname`, department: 'Floor', position: 'Service' }))
// e3..e10 scheduled but not in: 4 started before 19:20 (late), 4 start later.
const starts = ['17:00', '18:00', '18:30', '19:00', '20:00', '20:30', '21:00', '22:00']
const todayShifts = [
  { id: 's1', employeeId: 'e1', date: '2026-10-29', startTime: '17:00', endTime: '23:00' },
  { id: 's2', employeeId: 'e2', date: '2026-10-29', startTime: '18:00', endTime: '23:00' },
  ...starts.map((startTime, i) => ({ id: `s${i + 3}`, employeeId: `e${i + 3}`, date: '2026-10-29', startTime, endTime: '23:30' })),
]

let container
afterEach(() => {
  vi.useRealTimers()
  container?.remove()
  document.body.innerHTML = ''
})

async function render(shifts = todayShifts) {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(OnShiftSheet, { workspaceId: 'w1', employees, todayShifts: shifts, timeZone: 'Europe/Nicosia', onClose: () => {} }))
  })
  await act(async () => { await Promise.resolve() })
}

const cards = () => [...document.querySelectorAll('.on-shift-summary button')]
const names = () => [...document.querySelectorAll('.on-shift-person strong')].map((el) => el.textContent)

describe('OnShiftSheet summary filters', () => {
  it('filters the list by the tapped summary card', async () => {
    await render()
    expect(cards().map((c) => c.textContent)).toEqual(['2Μέσα τώρα', '1Διάλειμμα', '8Δεν ήρθαν · 4 αργούν'])
    expect(cards()[0].classList.contains('is-active')).toBe(true)
    expect(names()).toHaveLength(2)

    await act(async () => { cards()[1].click() })
    expect(cards()[1].getAttribute('aria-selected')).toBe('true')
    expect(names()).toEqual(['Person2 S.'])

    await act(async () => { cards()[2].click() })
    expect(names()).toHaveLength(8)
    const lateCount = document.querySelectorAll('.on-shift-badge.is-late').length
    expect(lateCount).toBe(4)
    // Late people are listed before the ones still to come.
    const rows = [...document.querySelectorAll('.on-shift-person')]
    expect(rows.slice(0, 4).every((row) => row.querySelector('.is-late'))).toBe(true)
  })

  it('shows an empty state per filter', async () => {
    await render(todayShifts.slice(0, 2))
    await act(async () => { cards()[2].click() })
    expect(names()).toHaveLength(0)
    expect(document.body.textContent).toContain('Όλοι όσοι έχουν βάρδια σήμερα έχουν έρθει.')
    await act(async () => { cards()[1].click() })
    expect(document.body.textContent).not.toContain('Κανείς δεν είναι σε διάλειμμα')
  })

  it('has no separate tabs; the cards are the filter', async () => {
    await render()
    expect(document.querySelector('.on-shift-tabs')).toBeNull()
    expect(document.querySelectorAll('.on-shift-sort button')).toHaveLength(3)
  })
})
