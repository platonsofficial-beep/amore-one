import { normalizeOnlineCapacity } from './onlineBooking'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CLOSED_STATUSES = new Set(['Cancelled', 'Not Shown', 'Rejected', 'No Show'])

export function parsePublicBookingPath(pathname = '') {
  const path = `${pathname ?? ''}`.replace(/\/+$/, '') || '/'
  const match = path.match(/^\/book\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/confirm)?$/)
  if (!match) return null
  return { slug: match[1], confirm: Boolean(match[2]) }
}

export function dateKeyInTimeZone(date, timeZone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
}

export function addDateDays(dateKey, days) {
  const [year, month, day] = `${dateKey}`.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return ''
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

export function weekdayIndexInTimeZone(dateKey, timeZone = 'UTC') {
  const noonUtc = new Date(`${`${dateKey}`.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(noonUtc.getTime())) return null
  let label = ''
  try {
    label = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      weekday: 'short',
    }).format(noonUtc)
  } catch {
    label = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(noonUtc)
  }
  const index = WEEKDAYS.indexOf(label)
  return index < 0 ? null : index
}

export function listBookableDateKeys({
  now = new Date(),
  timeZone = 'UTC',
  bookingWindowDays = 30,
} = {}) {
  const today = dateKeyInTimeZone(now, timeZone)
  const span = Math.max(0, Math.min(365, Math.trunc(Number(bookingWindowDays) || 0)))
  const dates = []
  for (let offset = 0; offset <= span; offset += 1) {
    dates.push(addDateDays(today, offset))
  }
  return dates
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

export function slotInstant(dateKey, time, timeZone = 'UTC') {
  const match = `${time ?? ''}`.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const guess = new Date(`${`${dateKey}`.slice(0, 10)}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  try {
    const parts = zonedParts(guess, timeZone)
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    const wanted = Date.UTC(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      Number(dateKey.slice(8, 10)),
      hours,
      minutes,
    )
    return new Date(guess.getTime() + (wanted - actual))
  } catch {
    return guess
  }
}

export function isSlotAfterNotice({
  dateKey,
  time,
  now = new Date(),
  minNoticeMinutes = 0,
  timeZone = 'UTC',
}) {
  const at = slotInstant(dateKey, time, timeZone)
  if (!at) return false
  const notice = Math.max(0, Number(minNoticeMinutes) || 0)
  return at.getTime() >= now.getTime() + notice * 60 * 1000
}

export function visibleOnlineAreas(areas = []) {
  return (areas ?? []).filter((area) => area && area.onlineBookingVisible !== false && area.id)
}

export function countsTowardOnlineCapacity(reservation) {
  if (`${reservation?.source ?? ''}`.toLowerCase() !== 'online') return false
  return !CLOSED_STATUSES.has(`${reservation?.status ?? ''}`)
}

export function usedOnlineCovers(reservations = [], { seatingId = '', dateKey = '', areaId = '' } = {}) {
  return (reservations ?? []).reduce((sum, reservation) => {
    if (!countsTowardOnlineCapacity(reservation)) return sum
    if (`${reservation.seatingId ?? reservation.seating_id ?? ''}` !== `${seatingId}`) return sum
    if (`${reservation.date ?? reservation.reservation_date ?? ''}`.slice(0, 10) !== `${dateKey}`.slice(0, 10)) return sum
    if (areaId && `${reservation.areaId ?? reservation.online_area_id ?? ''}` !== `${areaId}`) return sum
    const party = Math.trunc(Number(reservation.party ?? reservation.party_size ?? reservation.guests) || 0)
    return sum + Math.max(0, party)
  }, 0)
}

export function areaCapFor(seating, areaId) {
  const caps = seating?.onlineAreaCaps ?? seating?.online_area_caps ?? {}
  if (!caps || typeof caps !== 'object') return null
  return normalizeOnlineCapacity(caps[areaId])
}

export function hasCoverRoom(capacity, used, party) {
  if (capacity == null) return true
  return used + party <= capacity
}

export function availablePublicSlots({
  seatings = [],
  areas = [],
  reservations = [],
  dateKey = '',
  party = 1,
  now = new Date(),
  timeZone = 'UTC',
  minNoticeMinutes = 0,
} = {}) {
  const covers = Math.trunc(Number(party) || 0)
  if (covers < 1) return []
  const weekday = weekdayIndexInTimeZone(dateKey, timeZone)
  if (weekday == null) return []
  const openAreas = visibleOnlineAreas(areas)
  if (openAreas.length === 0) return []

  return (seatings ?? []).filter((seating) => seating?.isActive !== false && seating?.id).flatMap((seating) => {
    const days = Array.isArray(seating.daysOfWeek ?? seating.days_of_week)
      ? (seating.daysOfWeek ?? seating.days_of_week).map(Number)
      : [0, 1, 2, 3, 4, 5, 6]
    if (!days.includes(weekday)) return []
    const time = `${seating.startTime ?? seating.start_time ?? ''}`.trim()
    if (!isSlotAfterNotice({ dateKey, time, now, minNoticeMinutes, timeZone })) return []
    const seatingCapacity = normalizeOnlineCapacity(seating.onlineCapacity ?? seating.online_capacity)
    const seatingUsed = usedOnlineCovers(reservations, { seatingId: seating.id, dateKey })
    if (!hasCoverRoom(seatingCapacity, seatingUsed, covers)) return []
    const areasOpen = openAreas.filter((area) => {
      const cap = areaCapFor(seating, area.id)
      const used = usedOnlineCovers(reservations, { seatingId: seating.id, dateKey, areaId: area.id })
      return hasCoverRoom(cap, used, covers)
    })
    if (areasOpen.length === 0) return []
    return [{
      seatingId: seating.id,
      name: seating.name,
      time,
      areas: areasOpen,
    }]
  })
}

export function publicBookingStatus(confirmationMethod) {
  return confirmationMethod === 'instant' ? 'Confirmed' : 'Pending'
}

export function validatePublicReservation(input, info) {
  const honeypot = `${input?.honeypot ?? ''}`.trim()
  if (honeypot) return { ok: true, ignored: true }

  if (!info?.enabled) return { ok: false, reason: 'unavailable' }
  const party = Math.trunc(Number(input?.party) || 0)
  if (party < 1) return { ok: false, reason: 'invalid' }
  if (party > Number(info.maxPartySize || 0)) return { ok: false, reason: 'call_us' }

  const name = `${input?.name ?? ''}`.trim()
  const phone = `${input?.phone ?? ''}`.replace(/[^\d+]/g, '')
  const email = `${input?.email ?? ''}`.trim()
  const note = `${input?.note ?? ''}`.trim().slice(0, 500)
  if (name.length < 2 || name.length > 80) return { ok: false, reason: 'name' }
  if (phone.length < 8 || phone.length > 20) return { ok: false, reason: 'phone' }
  if (info.confirmationMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: 'email' }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'email' }
  if (!input?.consent) return { ok: false, reason: 'consent' }

  const dates = listBookableDateKeys({
    now: input.now,
    timeZone: info.timeZone,
    bookingWindowDays: info.bookingWindowDays,
  })
  if (!dates.includes(`${input.date ?? ''}`.slice(0, 10))) return { ok: false, reason: 'date' }

  const slots = availablePublicSlots({
    seatings: info.seatings,
    areas: info.areas,
    reservations: info.reservations,
    dateKey: input.date,
    party,
    now: input.now,
    timeZone: info.timeZone,
    minNoticeMinutes: info.minNoticeMinutes,
  })
  const slot = slots.find((entry) => entry.seatingId === input.seatingId)
  if (!slot) return { ok: false, reason: 'full' }
  const area = slot.areas.find((entry) => entry.id === input.areaId)
  if (!area) return { ok: false, reason: 'area' }

  return {
    ok: true,
    reservation: {
      name,
      phone,
      email,
      note,
      party,
      date: `${input.date}`.slice(0, 10),
      time: slot.time,
      seatingId: slot.seatingId,
      seatingName: slot.name,
      areaId: area.id,
      areaLabel: area.label,
      smoking: Boolean(area.smoking),
      status: publicBookingStatus(info.confirmationMethod),
      confirmationMethod: info.confirmationMethod,
    },
  }
}

export function confirmationCopyKey(method) {
  if (method === 'instant') return 'Your reservation is confirmed.'
  if (method === 'email') return 'Check your email to confirm this reservation.'
  return 'The venue will call you to confirm.'
}
