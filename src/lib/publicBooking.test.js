import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPublicBookingEmail, publicConfirmUrl } from './publicBookingEmail'
import {
  arrivalSlotsForSeating,
  assignSeatingForArrival,
  availablePublicSlots,
  formatPublicBookingWhen,
  listBookableDateKeys,
  parsePublicBookingPath,
  publicBookingStatus,
  seatingWindow,
  validatePublicReservation,
} from './publicBooking'

const NOW = new Date('2026-07-10T08:00:00Z')

const INFO = {
  enabled: true,
  confirmationMethod: 'email',
  maxPartySize: 8,
  bookingWindowDays: 30,
  minNoticeMinutes: 120,
  timeZone: 'Europe/Athens',
  areas: [
    { id: 'main', label: 'Κύρια', smoking: false, onlineBookingVisible: true },
    { id: 'terrace', label: 'Βεράντα', smoking: true, onlineBookingVisible: true },
    { id: 'private', label: 'Private', smoking: false, onlineBookingVisible: false },
  ],
  seatings: [
    {
      id: 'dinner',
      name: 'Dinner',
      startTime: '20:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
      onlineCapacity: 10,
      onlineAreaCaps: { terrace: 4 },
    },
  ],
  reservations: [],
}

describe('public booking path', () => {
  it('reads the guest page and the confirm page', () => {
    expect(parsePublicBookingPath('/book/amore')).toEqual({ slug: 'amore', confirm: false })
    expect(parsePublicBookingPath('/book/amore/confirm')).toEqual({ slug: 'amore', confirm: true })
    expect(parsePublicBookingPath('/reservations')).toBeNull()
    expect(parsePublicBookingPath('/book/Amore')).toBeNull()
  })
})

describe('public booking availability', () => {
  it('offers the seating time inside the window and after the notice', () => {
    const dates = listBookableDateKeys({ now: NOW, timeZone: 'Europe/Athens', bookingWindowDays: 2 })
    expect(dates[0]).toBe('2026-07-10')
    expect(dates).toHaveLength(3)
    const slots = availablePublicSlots({
      ...INFO,
      dateKey: '2026-07-10',
      party: 2,
      now: NOW,
    })
    expect(slots).toHaveLength(1)
    expect(slots[0].areas.map((area) => area.id)).toEqual(['main', 'terrace'])
  })

  it('hides a seating that is full and an area that is over its cap', () => {
    const full = availablePublicSlots({
      ...INFO,
      reservations: [{ source: 'online', seatingId: 'dinner', date: '2026-07-10', areaId: 'main', party: 10, status: 'Confirmed' }],
      dateKey: '2026-07-10',
      party: 2,
      now: NOW,
    })
    expect(full[0].state).toBe('full')
    expect(full[0].slots).toEqual([])

    const areaFull = availablePublicSlots({
      ...INFO,
      reservations: [{ source: 'online', seatingId: 'dinner', date: '2026-07-10', areaId: 'terrace', party: 4, status: 'Pending' }],
      dateKey: '2026-07-10',
      party: 2,
      now: NOW,
    })
    expect(areaFull[0].areas.map((area) => area.id)).toEqual(['main'])
  })

  it('rejects a large party, a missing email, and a full slot', () => {
    expect(validatePublicReservation({
      ...draft(),
      party: 12,
    }, INFO).reason).toBe('call_us')
    expect(validatePublicReservation({
      ...draft(),
      email: '',
    }, INFO).reason).toBe('email')
    expect(publicBookingStatus('instant')).toBe('Confirmed')
    expect(publicBookingStatus('venue_call')).toBe('Pending')

    const accepted = validatePublicReservation(draft(), INFO)
    expect(accepted.ok).toBe(true)
    expect(accepted.reservation.status).toBe('Pending')
    expect(accepted.reservation.areaLabel).toBe('Βεράντα')
    expect(validatePublicReservation({ ...draft(), honeypot: 'spam' }, INFO)).toEqual({ ok: true, ignored: true })
  })
})

describe('public seating windows', () => {
  const first = { id: 'first', name: '1st seating', startTime: '19:00', durationMinutes: 120, isActive: true }
  const second = { id: 'second', name: '2nd seating', startTime: '21:00', durationMinutes: 120, isActive: true }

  it('lists 15-minute arrivals up to the end buffer and assigns the window that contains the time', () => {
    expect(seatingWindow(first)).toMatchObject({ startTime: '19:00', endTime: '21:00' })
    expect(arrivalSlotsForSeating(first)[0]).toBe('19:00')
    expect(arrivalSlotsForSeating(first).at(-1)).toBe('20:30')
    expect(assignSeatingForArrival([first, second], '20:40').seating.id).toBe('first')
    expect(assignSeatingForArrival([first, second], '20:40').contained).toBe(true)
    expect(assignSeatingForArrival([first, second], '18:40').seating.id).toBe('first')
    expect(assignSeatingForArrival([first, second], '18:40').contained).toBe(false)
  })
})

describe('public booking dates', () => {
  it('formats the day in Greek and English', () => {
    expect(formatPublicBookingWhen('2026-07-10', '20:00', 'el', 'Europe/Athens')).toBe('Παρασκευή 10 Ιουλίου · 20:00')
    expect(formatPublicBookingWhen('2026-07-10', '20:00', 'en', 'Europe/Athens')).toBe('Friday 10 July · 20:00')
  })
})

describe('public booking email', () => {
  it('renders confirm and cancel links for the reminder', () => {
    const token = 'abc123'
    const mail = buildPublicBookingEmail({
      kind: 'reminder',
      locale: 'el',
      venueName: 'Amore',
      guestName: 'Έλενα',
      date: '2026-07-10',
      time: '20:00',
      party: 4,
      areaLabel: 'Βεράντα',
      smoking: true,
      confirmationMethod: 'email',
      slug: 'amore',
      token,
    })
    expect(mail.subject).toBe('Επιβεβαιώστε την κράτηση')
    expect(mail.html).toContain(publicConfirmUrl('amore', token))
    expect(mail.html).toContain('action=confirm')
    expect(mail.html).toContain('action=cancel')
    expect(mail.html).toContain('Παρασκευή 10 Ιουλίου · 20:00')
    expect(mail.html).toContain('Καπνιστές')
    expect(mail.html).not.toContain('2026-07-10')
    expect(mail.html).not.toContain('<script')
  })
})

describe('public booking wiring', () => {
  it('keeps the guest page outside the signed-in shell and the service worker', () => {
    const main = readFileSync('src/main.jsx', 'utf8')
    expect(main).toContain('parsePublicBookingPath')
    expect(main.indexOf('parsePublicBookingPath')).toBeLessThan(main.indexOf('appEntry'))
    const vite = readFileSync('vite.config.js', 'utf8')
    expect(vite).toContain('navigateFallbackDenylist')
    expect(vite).toContain('navigateFallbackDenylist: [/^\\/book/]')
    const sql = readFileSync('supabase/online_booking_step2.sql', 'utf8')
    expect(sql).toContain('get_public_booking_info')
    expect(sql).toContain('get_public_availability')
    expect(sql).toContain('create_public_reservation')
    expect(sql).toContain('confirm_public_reservation')
    expect(sql).toContain('claim_public_booking_reminders')
    expect(sql).toContain('grant execute')
    expect(sql).toContain('to anon')
    expect(sql).toContain("source = 'online'")
    expect(sql).not.toMatch(/apply this file/i)
  })
})

function draft() {
  return {
    now: NOW,
    date: '2026-07-10',
    time: '20:00',
    party: 2,
    seatingId: 'dinner',
    areaId: 'terrace',
    name: 'Elena Costa',
    phone: '+302100000000',
    email: 'elena@example.com',
    note: 'Window',
    consent: true,
    honeypot: '',
  }
}
