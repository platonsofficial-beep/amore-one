import { describe, expect, it, vi } from 'vitest'
import { revealVenueStartField, venueStartKeyboardInset } from './venueStartLayout'

describe('venue start layout', () => {
  it('adds space only when the keyboard covers the page', () => {
    expect(venueStartKeyboardInset({ height: 420, offsetTop: 0 }, 800)).toBe(380)
    expect(venueStartKeyboardInset({ height: 760, offsetTop: 20 }, 800)).toBe(0)
    expect(venueStartKeyboardInset(null, 800)).toBe(0)
  })

  it('scrolls the focused link field into the visible area', () => {
    const field = { scrollIntoView: vi.fn() }
    revealVenueStartField(field)
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' })
    revealVenueStartField(null)
  })
})
