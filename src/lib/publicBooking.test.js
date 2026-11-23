import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPublicBookingEmail, publicConfirmUrl } from './publicBookingEmail'
import {
  arrivalHourOptions,
  arrivalMinuteOptions,
  arrivalSlotsForSeating,
  assignSeatingForArrival,
  availablePublicSlots,
  formatPublicBookingWhen,
  isLastSeatingOfDay,
  listBookableDateKeys,
  parsePublicBookingPath,
  publicBookingStatus,
  seatingContainsTime,
  seatingWindow,
  suggestBookingAlternatives,
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

    const dayFull = availablePublicSlots({
      ...INFO,
      dailyOnlineCovers: 6,
      reservations: [{ source: 'online', seatingId: 'other', date: '2026-07-10', party: 4, status: 'Confirmed' }],
      dateKey: '2026-07-10',
      party: 4,
      now: NOW,
    })
    expect(dayFull[0].state).toBe('full')
    expect(dayFull[0].slots).toEqual([])

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
    expect(validatePublicReservation({ ...draft(), understand: false }, INFO).reason).toBe('understand')
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
    expect(seatingContainsTime(second, '21:00')).toBe(true)
    expect(seatingContainsTime(second, '23:00')).toBe(false)
    expect(arrivalHourOptions(second)).toEqual(['21', '22'])
    expect(arrivalMinuteOptions(second, '22')).toContain('59')
    expect(arrivalMinuteOptions(second, '22')).not.toContain('60')
    expect(arrivalSlotsForSeating(second)[0]).toBe('21:00')
    expect(isLastSeatingOfDay([first, second], second)).toBe(true)
    expect(isLastSeatingOfDay([first, second], first)).toBe(false)
    expect(validatePublicReservation({ ...draft(), time: '23:00', seatingId: 'second' }, {
      ...INFO,
      seatings: [first, second],
    }).reason).toBe('time')
  })

  it('stops arrivals at the weekday last time and rejects a later weekend time on a weekday', () => {
    const dinner = {
      id: 'dinner',
      name: 'Dinner',
      startTime: '18:00',
      durationMinutes: 330,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
      dayHours: {
        4: { open: true, start: '18:00', end: '23:00', lastArrival: '' },
        0: { open: true, start: '18:00', end: '23:30', lastArrival: '' },
      },
    }
    const weekday = availablePublicSlots({
      seatings: [dinner],
      areas: [{ id: 'main', label: 'Main' }],
      dateKey: '2026-11-19',
      party: 2,
      now: new Date('2026-11-01T08:00:00Z'),
      timeZone: 'Europe/Nicosia',
      minNoticeMinutes: 0,
    })
    const weekend = availablePublicSlots({
      seatings: [dinner],
      areas: [{ id: 'main', label: 'Main' }],
      dateKey: '2026-11-22',
      party: 2,
      now: new Date('2026-11-01T08:00:00Z'),
      timeZone: 'Europe/Nicosia',
      minNoticeMinutes: 0,
    })
    expect(weekday[0].slots.at(-1)).toBe('22:30')
    expect(weekend[0].slots.at(-1)).toBe('23:00')
    expect(weekend[0].slots).not.toContain('23:15')
    expect(assignSeatingForArrival([dinner], '23:00', '2026-11-19')).toEqual({ seating: null, contained: false })
    expect(assignSeatingForArrival([dinner], '23:00', '2026-11-22').contained).toBe(true)
    expect(arrivalHourOptions({ ...weekend[0], durationMinutes: 330 })).toContain('23')
    expect(arrivalMinuteOptions({ ...weekend[0], durationMinutes: 330 }, '23')).toContain('00')
    expect(arrivalMinuteOptions({ ...weekend[0], durationMinutes: 330 }, '23')).not.toContain('15')
    expect(validatePublicReservation({
      ...draft(),
      date: '2026-11-19',
      time: '23:00',
      now: new Date('2026-11-01T08:00:00Z'),
    }, {
      ...INFO,
      timeZone: 'Europe/Nicosia',
      seatings: [dinner],
    }).reason).toBe('time')
  })
})

describe('full seating suggestions', () => {
  const open = { seatingId: 'second', state: 'available', slots: ['21:00'], areas: [{ id: 'terrace' }] }
  const full = { seatingId: 'first', state: 'full', slots: [], areas: [] }

  it('offers other seatings the same day, then the next days', () => {
    expect(suggestBookingAlternatives({
      dayCards: [full, open],
      chosenSeatingId: 'first',
      areaId: 'terrace',
    }).seatings.map((card) => card.seatingId)).toEqual(['second'])

    const later = suggestBookingAlternatives({
      dayCards: [full],
      chosenSeatingId: 'first',
      areaId: 'terrace',
      upcoming: [
        { date: '2026-07-11', cards: [full] },
        { date: '2026-07-12', cards: [open] },
      ],
    })
    expect(later.seatings).toEqual([])
    expect(later.dates.map((day) => day.date)).toEqual(['2026-07-12'])
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
      startTime: '19:00',
      endTime: '21:00',
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
    expect(mail.html).toContain('Η κράτησή σας είναι για το σερβίρισμα 19:00–21:00. Παρακαλούμε το τραπέζι να είναι ελεύθερο στις 21:00 για τους επόμενους επισκέπτες.')
    expect(mail.html).not.toContain('2026-07-10')
    expect(mail.html).not.toContain('<script')
    expect(mail.html).not.toContain('tel:')
    expect(mail.html).not.toContain('mailto:')
    expect(mail.html).not.toContain('google.com/maps')
    expect(mail.html).not.toContain('Οδηγίες')
  })

  it('adds tap-to-call, email, and map links and hides empty contact details', () => {
    const mail = buildPublicBookingEmail({
      kind: 'received',
      locale: 'en',
      venueName: 'The Harbour Bar',
      guestName: 'Elena',
      date: '2026-07-10',
      time: '20:00',
      party: 2,
      venuePhone: '+357 99 111222',
      contactEmail: 'desk@harbour.example',
      venueAddress: '12 Harbour Street',
      city: 'Nicosia',
    })
    expect(mail.html).toContain('href="tel:+35799111222"')
    expect(mail.html).toContain('href="mailto:desk@harbour.example"')
    expect(mail.html).toContain('Get directions')
    expect(mail.html).toContain('google.com/maps')
    expect(mail.html).toContain('12 Harbour Street, Nicosia')
  })

  it('uses a gold directions button for saved coordinates', () => {
    const mail = buildPublicBookingEmail({
      kind: 'reminder',
      locale: 'el',
      venueName: 'The Harbour Bar',
      date: '2026-07-10',
      time: '20:00',
      party: 2,
      venueLat: 35.17,
      venueLng: 33.36,
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=35.17,33.36',
    })
    expect(mail.html).toContain('Οδηγίες')
    expect(mail.html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=35.17,33.36"')
    expect(mail.html).toContain('background:#d4af37')
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
    expect(sql).toContain('daily_online_covers')
    expect(sql).toContain('p_understand')
    expect(sql).toContain('p_date, v_arrival,')
    const contact = readFileSync('supabase/venue_contact_details.sql', 'utf8')
    expect(contact).toContain('Not applied')
    expect(contact).toContain('add column if not exists venue_phone')
    expect(contact).toContain('add column if not exists venue_address')
    expect(contact).toContain('add column if not exists contact_email')
    expect(contact).toContain('get_public_booking_info')
    expect(contact).toContain('public_booking_email_payload')
    expect(contact).toContain('claim_public_booking_reminders')
    expect(contact).toContain("'contactEmail'")
    expect(contact).toContain('dayHours')
    expect(contact).toContain('email_reminder_sent_at')
    const location = readFileSync('supabase/venue_location.sql', 'utf8')
    expect(location).toContain('Not applied')
    expect(location).toContain('venue_lat double precision')
    expect(location).toContain('venue_lng double precision')
    expect(location).toContain('grant select (venue_lat, venue_lng)')
    expect(location).toContain('grant insert (venue_lat, venue_lng)')
    expect(location).toContain('grant update (venue_lat, venue_lng)')
    expect(location).toContain("'venueLat'")
    expect(location).toContain("'venueLng'")
    expect(location).toContain("'mapsUrl'")
    expect(location).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(location).toContain('dayHours')
    expect(location).toContain("'contactEmail'")
    expect(location).toContain('email_reminder_sent_at')
    const patch = readFileSync('supabase/online_booking_reservation_time.sql', 'utf8')
    expect(patch).toContain('p_date, v_arrival,')
    expect(patch).toContain('Not applied')
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
    understand: true,
    honeypot: '',
  }
}
