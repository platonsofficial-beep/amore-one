// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/PublishedFloorPlanContext', () => ({ usePublishedFloorPlan: () => ({ layout: null }) }))

import { MobileManagerReservationsView } from './MobileManagerReservationsView'

describe('portrait Bookings row (Platon t445u)', () => {
  it('shows service, guest type, guests, tables and a status pill', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
      <MobileManagerReservationsView
        reservations={[{ id: 'r1', date: '2026-11-04', time: '13:30', guestName: 'Maria Papariga', guests: 4, tableNumber: 'T10 + T11', status: 'Pending', customerType: 'VVIP', notes: '' }]}
        selectedDate="2026-11-04"
        todayKey="2026-11-04"
        canManage
      />,
    ))
    const row = container.querySelector('.manager-portrait-reservation')
    expect(row?.querySelector('strong')?.textContent).toBe('Maria Papariga')
    expect(row?.querySelector('.host-reservation-guest-type-badge')?.textContent).toBe('VVIP')
    expect(row?.querySelector('.host-reservation-card-purpose-label')?.textContent).toContain('Dinner')
    expect(row?.textContent).toContain('4 guests')
    expect(row?.textContent).toContain('T10 + T11')
    expect(row?.querySelector('.manager-portrait-reservation-status')?.textContent).toMatch(/pending/i)
  })
})
