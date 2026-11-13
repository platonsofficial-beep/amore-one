/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { GuestDirectory, GuestPhoneInsight } from './GuestHistory'
import { buildGuestPreviewProfiles, buildGuestPreviewReservations } from '../../lib/guestHistoryPreview'

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

const reservations = buildGuestPreviewReservations()

describe('guest history screens', () => {
  it('shows the guest card after the phone settles', () => {
    const view = render(createElement(GuestPhoneInsight, {
      phone: '+35799111222',
      reservations,
      profiles: buildGuestPreviewProfiles(),
      role: 'host',
      lookupDelay: 0,
    }))
    expect(document.body.textContent).toContain('Maria Costa')
    expect(document.body.textContent).toContain('Visits')
    expect(document.body.textContent).toContain('shellfish')
    view.unmount()
  })

  it('blocks a host on a blacklisted phone and shows the reason', () => {
    const view = render(createElement(GuestPhoneInsight, {
      phone: '+35799222333',
      reservations,
      profiles: buildGuestPreviewProfiles(),
      role: 'host',
      lookupDelay: 0,
    }))
    expect(document.body.textContent).toContain('Blacklisted guest — No-show without calling, twice')
    expect(document.body.textContent).toContain('Ask a manager')
    view.unmount()
  })

  it('opens guest history with past bookings', () => {
    const view = render(createElement(GuestDirectory, {
      reservations,
      profiles: buildGuestPreviewProfiles(),
      role: 'manager',
      initialPhone: '+35799111222',
      onClose: () => {},
    }))
    expect(document.body.textContent).toContain('Bookings')
    expect(document.body.textContent).toContain('Checked Out')
    expect(document.body.textContent).toContain('Not Shown')
    view.unmount()
  })
})
