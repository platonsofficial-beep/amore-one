import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createInitialBuilderState, floorPlanBuilderReducer } from '../floor-plan-builder/context/floorPlanBuilderContextState'
import {
  isOnlineReservation,
  needsVenueCallConfirm,
  allocatedOnlineCovers,
  normalizeOnlineBookingSettings,
  splitExceedsDailyTotal,
  normalizeOnlineCapacity,
  commitPublicSlug,
  draftPublicSlug,
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

  it('keeps a public link draft editable and commits it on blur', () => {
    expect(draftPublicSlug('')).toBe('')
    expect(draftPublicSlug('Amore-')).toBe('amore-')
    expect(draftPublicSlug('amore.nicosia')).toBe('amore-nicosia')
    expect(draftPublicSlug('Amore Nicosia')).toBe('amore-nicosia')
    expect(draftPublicSlug('amore__nicosia')).toBe('amore--nicosia')
    expect(draftPublicSlug('Καφέ Αθήνα')).toBe('kafe-athina')
    expect(commitPublicSlug('amore-')).toBe('amore')
    expect(commitPublicSlug('amore--nicosia')).toBe('amore-nicosia')
    expect(commitPublicSlug('')).toBe('')
    expect(commitPublicSlug('ab')).toBe('')
    expect(commitPublicSlug('---')).toBe('')
    expect(commitPublicSlug('amore-nicosia')).toBe('amore-nicosia')
  })

  it('defaults to instant confirmation, 8 guests, 30 days, 2 hours notice, and 12 hours before email', () => {
    expect(normalizeOnlineBookingSettings({}, { venueName: 'Amore' })).toEqual({
      enabled: false,
      slug: 'amore',
      confirmationMethod: 'instant',
      emailConfirmHours: 12,
      maxPartySize: 8,
      bookingWindowDays: 30,
      minNoticeMinutes: 120,
      venuePhone: '',
      dailyOnlineCovers: null,
    })
    expect(normalizeOnlineBookingSettings({ auto_confirm: false }).confirmationMethod).toBe('venue_call')
    expect(normalizeOnlineBookingSettings({ daily_online_covers: 80 }).dailyOnlineCovers).toBe(80)
    expect(normalizeOnlineBookingSettings({ dailyOnlineCovers: '' }).dailyOnlineCovers).toBeNull()
  })

  it('blocks a seating split that is over the daily total', () => {
    const caps = [50, 30]
    expect(allocatedOnlineCovers(caps)).toBe(80)
    expect(splitExceedsDailyTotal(caps, 80)).toBe(false)
    expect(splitExceedsDailyTotal([50, 40], 80)).toBe(true)
    expect(splitExceedsDailyTotal([50, 40], '')).toBe(false)
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
    expect(needsVenueCallConfirm({
      source: 'online',
      confirmationMethod: 'venue_call',
      status: 'Pending',
    })).toBe(true)
    expect(needsVenueCallConfirm({
      source: 'online',
      confirmationMethod: 'email',
      status: 'Pending',
    })).toBe(false)

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

  it('lets the public link field stay empty while typing', () => {
    const source = readFileSync('src/components/workspace/OnlineReservationsSection.jsx', 'utf8')
    expect(source).toContain('draftPublicSlug')
    expect(source).toContain('autoComplete="off"')
    expect(source).toContain('autoCorrect="off"')
    expect(source).toContain('autoCapitalize="none"')
    expect(source).toContain('spellCheck={false}')
    expect(source).toContain('name="booking-public-slug"')
    expect(source).not.toContain('slugifyVenueName(event.target.value)')
  })

  it('keeps the Greek booking-window label on one short line', () => {
    const el = JSON.parse(readFileSync('src/i18n/locales/el.json', 'utf8'))
    expect(el['Days guests can book ahead']).toBe('Κρατήσεις έως (ημέρες)')
  })

  it('uses a gold custom radio and an even two-row call layout', () => {
    const settings = readFileSync('src/components/workspace/onlineReservations.css', 'utf8')
    const radio = settings.match(/\.online-booking-method input\[type="radio"\] \{[^}]*\}/)?.[0] ?? ''
    expect(radio).toContain('appearance: none')
    expect(radio).toContain('-webkit-appearance: none')
    expect(settings).toContain('border-color: var(--one-gold)')
    expect(settings).toContain('radial-gradient(circle at center, var(--one-gold)')

    const app = readFileSync('src/App.css', 'utf8')
    const actionStart = app.indexOf('.host-reservation-card-quick-action {\n  display: inline-flex;')
    const action = app.slice(actionStart, actionStart + 600)
    expect(action).toContain('align-items: center')
    expect(action).toContain('text-decoration: none')
    expect(app).toContain('.host-reservation-quick-row')
    expect(app).toContain('grid-auto-flow: column')
    expect(app).toContain('grid-auto-columns: minmax(0, 1fr)')
  })
})
