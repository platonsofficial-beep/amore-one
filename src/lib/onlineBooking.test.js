import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createInitialBuilderState, floorPlanBuilderReducer } from '../floor-plan-builder/context/floorPlanBuilderContextState'
import {
  isOnlineReservation,
  normalizeOnlineBookingSettings,
  normalizeOnlineCapacity,
  onlineBookingUrl,
  slugifyVenueName,
  sumVenueCovers,
} from './onlineBooking'
import { serializeReservationSeatingRow, validateReservationSeatingForm } from './reservationSeatings'

describe('online booking settings', () => {
  it('builds a public slug and link from the venue name', () => {
    expect(slugifyVenueName('Amoré  Kitchen')).toBe('amore-kitchen')
    expect(onlineBookingUrl('Amoré  Kitchen')).toBe('https://app.onehospitality.app/book/amore-kitchen')
  })

  it('defaults to auto-confirm, 8 guests, 30 days, and 2 hours notice', () => {
    expect(normalizeOnlineBookingSettings({}, { venueName: 'Amore' })).toEqual({
      enabled: false,
      slug: 'amore',
      autoConfirm: true,
      maxPartySize: 8,
      bookingWindowDays: 30,
      minNoticeMinutes: 120,
      venuePhone: '',
    })
  })

  it('sums table covers and keeps seating online capacity optional', () => {
    expect(sumVenueCovers([
      { type: 'table', properties: { capacity: 4 } },
      { type: 'table', properties: { maxGuests: 6 } },
      { type: 'wall' },
    ])).toBe(10)
    expect(normalizeOnlineCapacity('')).toBeNull()
    expect(normalizeOnlineCapacity('60')).toBe(60)

    const validation = validateReservationSeatingForm({
      name: 'Dinner',
      startTime: '19:00',
      durationMinutes: 120,
      daysOfWeek: [1, 2, 3, 4, 5],
      onlineCapacity: '60',
      onlineAreaCaps: { terrace: '20', bar: '' },
    })
    expect(validation.ok).toBe(true)
    expect(serializeReservationSeatingRow(validation.seating, 'venue-a')).toMatchObject({
      online_capacity: 60,
      online_area_caps: { terrace: 20 },
    })
  })

  it('recognises an online reservation and stores area toggles on the floor', () => {
    expect(isOnlineReservation({ source: 'online' })).toBe(true)
    expect(isOnlineReservation({ source: 'staff' })).toBe(false)

    const state = createInitialBuilderState({ initialEditing: true })
    const floorId = state.activeFloorId
    const next = floorPlanBuilderReducer(state, {
      type: 'UPDATE_FLOOR_ONLINE',
      payload: { floorId, smoking: true, onlineBookingVisible: true },
    })
    const floor = next.floors.find((entry) => entry.id === floorId)
    expect(floor.smoking).toBe(true)
    expect(floor.onlineBookingVisible).toBe(true)
    expect(next.hasUnsavedChanges).toBe(true)
  })

  it('keeps the Greek booking-window label on one short line', () => {
    const el = JSON.parse(readFileSync('src/i18n/locales/el.json', 'utf8'))
    expect(el['Days guests can book ahead']).toBe('Κρατήσεις έως (ημέρες)')
  })
})
