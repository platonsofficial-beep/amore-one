/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { PublicBookingView } from './PublicBookingView'

function renderBooking(info) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(PublicBookingView, { phase: 'loading', info }))
  })
  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('public booking venue contact', () => {
  it('links the phone, email, and address and hides empty ones', () => {
    const filled = renderBooking({
      venueName: 'The Harbour Bar',
      venuePhone: '+357 99 111222',
      contactEmail: 'desk@harbour.example',
      venueAddress: '12 Harbour Street',
      city: 'Nicosia',
    })
    const links = [...filled.container.querySelectorAll('.public-booking-contact a')].map((link) => link.getAttribute('href'))
    expect(links[0]).toBe('tel:+35799111222')
    expect(links[1]).toBe('mailto:desk@harbour.example')
    expect(filled.container.textContent).toContain('12 Harbour Street, Nicosia')
    expect(filled.container.querySelector('.public-booking-directions')?.textContent).toBe('Get directions')
    expect(links[2]).toContain('google.com/maps')
    expect(links[2]).toContain('12%20Harbour%20Street')
    filled.cleanup()

    const pinned = renderBooking({
      venueName: 'The Harbour Bar',
      venueAddress: '12 Harbour Street',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.17,33.36',
    })
    expect(pinned.container.querySelector('.public-booking-directions')?.getAttribute('href'))
      .toBe('https://www.google.com/maps/search/?api=1&query=35.17,33.36')
    pinned.cleanup()

    const empty = renderBooking({ venueName: 'The Harbour Bar', city: 'Nicosia' })
    expect(empty.container.querySelector('.public-booking-contact')).toBeNull()
    empty.cleanup()
  })
})
