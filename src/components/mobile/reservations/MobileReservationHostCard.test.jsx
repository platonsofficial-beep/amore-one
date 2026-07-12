/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileReservationHostCard } from './MobileReservationHostCard'

const reservation = {
  id: 'res-1',
  guestName: 'Papadopoulos',
  guests: 4,
  time: '20:30',
  date: '2026-07-10',
  status: 'Pending',
  tableNumber: '12',
}

function renderCard(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileReservationHostCard, {
      reservation,
      todayKey: '2026-07-10',
      nowMinutes: 18 * 60,
      isLandscapeLayout: true,
      onSelect: vi.fn(),
      onQuickStatusUpdate: vi.fn(),
      onEdit: vi.fn(),
      onOpenStatusMenu: vi.fn(),
      onOpenRowMenu: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MobileReservationHostCard compact tablet row', () => {
  it('renders a compact row without large quick action buttons in landscape layout', () => {
    const { container, unmount } = renderCard()

    expect(container.querySelector('.mobile-host-reservation-row.is-compact')).toBeTruthy()
    expect(container.querySelector('.mobile-host-reservation-actions')).toBeNull()
    expect(container.querySelector('.mobile-host-reservation-row-name')?.textContent).toBe('Papadopoulos')
    expect(container.querySelector('.mobile-host-reservation-row-meta')?.textContent).toContain('4 guests')
    expect(container.querySelector('.mobile-host-reservation-row-meta')?.textContent).toContain('T12')

    unmount()
  })

  it('keeps large quick action buttons on portrait phone layout', () => {
    const { container, unmount } = renderCard({ isLandscapeLayout: false })

    expect(container.querySelector('.mobile-host-reservation-card')).toBeTruthy()
    expect(container.querySelector('.mobile-host-reservation-actions')).toBeTruthy()
    expect(container.querySelector('.mobile-host-reservation-row.is-compact')).toBeNull()

    unmount()
  })

  it('renders drinks purpose beside the guest name on compact tablet rows', () => {
    const { container, unmount } = renderCard({
      reservation: {
        ...reservation,
        guestName: 'Andreas Nicolaou',
        notes: 'Bar table\n@@PURPOSE@@drinks',
        reservationPurpose: 'drinks',
      },
    })

    expect(container.querySelector('.mobile-host-reservation-row-name')?.textContent).toContain('Andreas Nicolaou')
    expect(container.querySelector('.host-reservation-card-purpose-label')?.textContent).toBe('🍸 Drinks')

    unmount()
  })

  it('renders guest type badge below the guest name when present', () => {
    const { container, unmount } = renderCard({
      reservation: {
        ...reservation,
        guestName: 'Konstantina Spanomitrou',
        notes: 'Anniversary\n@@CUSTOMER@@VVIP',
        customerType: 'VVIP',
        tableNumber: 'T110',
      },
      useHostQueuePresentation: true,
    })

    const nameEl = container.querySelector('.mobile-host-reservation-row-name')
    const badgeRow = container.querySelector('.host-reservation-card-guest-type-row')
    const details = container.querySelector('.host-queue-row-details')

    expect(nameEl?.querySelector('.host-reservation-guest-type-badge')).toBeNull()
    expect(nameEl?.textContent).toContain('Konstantina Spanomitrou')
    expect(badgeRow?.querySelector('.host-reservation-guest-type-badge')?.textContent).toBe('VVIP')
    expect(details?.textContent).toContain('T110')

    unmount()
  })

  it('keeps guest name on its own line without sharing width with the badge', () => {
    const { container, unmount } = renderCard({
      reservation: {
        ...reservation,
        guestName: 'Konstantina Spanomitrou',
        notes: 'Window seat\n@@CUSTOMER@@House Guest',
        customerType: 'House Guest',
      },
      useHostQueuePresentation: true,
    })

    expect(container.querySelector('.mobile-host-reservation-row-name-column')).not.toBeNull()
    expect(container.querySelector('.host-reservation-card-guest-type-row')).not.toBeNull()
    expect(container.querySelector('.mobile-host-reservation-row-name')?.textContent)
      .toContain('Konstantina Spanomitrou')
    expect(container.querySelector('.mobile-host-reservation-row-name')?.querySelector('.host-reservation-guest-type-badge'))
      .toBeNull()

    unmount()
  })

  it('does not render guest type badge for Normal guests', () => {
    const { container, unmount } = renderCard({
      reservation: {
        ...reservation,
        customerType: 'Regular',
      },
      useHostQueuePresentation: true,
    })

    expect(container.querySelector('.host-reservation-guest-type-badge')).toBeNull()

    unmount()
  })
})
