import { normalizeOnlineCapacity } from './onlineBooking.js'

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

export function usedOnlineCoversForDate(reservations = [], dateKey = '') {
  return (reservations ?? []).reduce((sum, reservation) => {
    if (!countsTowardOnlineCapacity(reservation)) return sum
    if (`${reservation.date ?? reservation.reservation_date ?? ''}`.slice(0, 10) !== `${dateKey}`.slice(0, 10)) return sum
    const party = Math.trunc(Number(reservation.party ?? reservation.party_size ?? reservation.guests) || 0)
    return sum + Math.max(0, party)
  }, 0)
}

function tighterAvailability(left, right) {
  if (left === 'full' || right === 'full') return 'full'
  if (left === 'few' || right === 'few') return 'few'
  return 'available'
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

export const ARRIVAL_SLOT_MINUTES = 15
export const ARRIVAL_END_BUFFER_MINUTES = 30

export function timeToMinutes(time) {
  const match = `${time ?? ''}`.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function minutesToTime(total) {
  const minutes = ((Math.trunc(total) % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function seatingWindow(seating) {
  const start = timeToMinutes(seating?.startTime ?? seating?.start_time)
  const rawDuration = Number(seating?.durationMinutes ?? seating?.duration_minutes)
  const duration = Number.isFinite(rawDuration) && rawDuration >= 15 ? rawDuration : 120
  if (start == null) return null
  return {
    start,
    end: start + duration,
    startTime: minutesToTime(start),
    endTime: minutesToTime(start + duration),
  }
}

export function arrivalSlotsForSeating(seating) {
  const window = seatingWindow(seating)
  if (!window) return []
  const last = window.end - ARRIVAL_END_BUFFER_MINUTES
  const endSlot = last >= window.start ? last : window.start
  const slots = []
  for (let minute = window.start; minute <= endSlot; minute += ARRIVAL_SLOT_MINUTES) {
    slots.push(minutesToTime(minute))
  }
  return slots
}

export function seatingContainsTime(seating, time) {
  const window = seatingWindow(seating)
  const minutes = timeToMinutes(time)
  if (!window || minutes == null) return false
  return minutes >= window.start && minutes < window.end
}

export function assignSeatingForArrival(seatings = [], time) {
  const minutes = timeToMinutes(time)
  const list = (seatings ?? []).filter((seating) => seating && seating.isActive !== false && seatingWindow(seating))
  if (minutes == null || list.length === 0) return { seating: null, contained: false }
  const containing = list
    .filter((seating) => seatingContainsTime(seating, time))
    .sort((left, right) => seatingWindow(left).start - seatingWindow(right).start)
  if (containing[0]) return { seating: containing[0], contained: true }
  let best = null
  let bestDistance = Infinity
  list.forEach((seating) => {
    const window = seatingWindow(seating)
    const distance = Math.min(Math.abs(minutes - window.start), Math.abs(minutes - window.end))
    const better = distance < bestDistance
      || (distance === bestDistance && best && window.start < seatingWindow(best).start)
    if (better || !best) {
      best = seating
      bestDistance = distance
    }
  })
  return { seating: best, contained: false }
}

export function seatingAvailabilityState(seating, used, party) {
  const capacity = normalizeOnlineCapacity(seating?.onlineCapacity ?? seating?.online_capacity)
  if (capacity == null) return 'available'
  const remaining = capacity - Math.max(0, used)
  if (remaining < party) return 'full'
  if (remaining <= Math.max(party, Math.ceil(capacity * 0.25))) return 'few'
  return 'available'
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
  dailyOnlineCovers = null,
} = {}) {
  const covers = Math.trunc(Number(party) || 0)
  if (covers < 1) return []
  const weekday = weekdayIndexInTimeZone(dateKey, timeZone)
  if (weekday == null) return []
  const openAreas = visibleOnlineAreas(areas)
  if (openAreas.length === 0) return []
  const dayState = seatingAvailabilityState(
    { onlineCapacity: dailyOnlineCovers },
    usedOnlineCoversForDate(reservations, dateKey),
    covers,
  )

  return (seatings ?? []).filter((seating) => seating?.isActive !== false && seating?.id).flatMap((seating) => {
    const days = Array.isArray(seating.daysOfWeek ?? seating.days_of_week)
      ? (seating.daysOfWeek ?? seating.days_of_week).map(Number)
      : [0, 1, 2, 3, 4, 5, 6]
    if (!days.includes(weekday)) return []
    const window = seatingWindow(seating)
    if (!window) return []
    const seatingUsed = usedOnlineCovers(reservations, { seatingId: seating.id, dateKey })
    const state = tighterAvailability(
      seatingAvailabilityState(seating, seatingUsed, covers),
      dayState,
    )
    const areasOpen = openAreas.filter((area) => {
      const cap = areaCapFor(seating, area.id)
      const used = usedOnlineCovers(reservations, { seatingId: seating.id, dateKey, areaId: area.id })
      return hasCoverRoom(cap, used, covers)
    })
    const slots = arrivalSlotsForSeating(seating).filter((time) => (
      isSlotAfterNotice({ dateKey, time, now, minNoticeMinutes, timeZone })
    ))
    const bookable = state !== 'full' && areasOpen.length > 0 && slots.length > 0
    return [{
      ...seating,
      seatingId: seating.id,
      name: seating.name,
      startTime: window.startTime,
      endTime: window.endTime,
      time: window.startTime,
      state: bookable ? state : 'full',
      slots: bookable ? slots : [],
      areas: areasOpen,
    }]
  })
}

export function suggestBookingAlternatives({
  dayCards = [],
  chosenSeatingId = '',
  areaId = '',
  upcoming = [],
  limitDates = 3,
} = {}) {
  const keepsArea = (card) => !areaId || (card.areas ?? []).some((area) => area.id === areaId)
  const open = (card) => card && card.state !== 'full' && (card.slots ?? []).length > 0
  const sameDay = (dayCards ?? []).filter((card) => (
    card.seatingId !== chosenSeatingId && open(card) && keepsArea(card)
  ))
  if (sameDay.length > 0) return { seatings: sameDay, dates: [] }
  const anyArea = (dayCards ?? []).filter((card) => card.seatingId !== chosenSeatingId && open(card))
  if (anyArea.length > 0) return { seatings: anyArea, dates: [], areaCleared: true }
  const dates = []
  ;(upcoming ?? []).forEach((day) => {
    if (dates.length >= limitDates) return
    const seatings = (day.cards ?? []).filter((card) => open(card) && keepsArea(card))
    const fallback = seatings.length ? seatings : (day.cards ?? []).filter(open)
    if (fallback.length) dates.push({ date: day.date, seatings: fallback })
  })
  return { seatings: [], dates }
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
  if (!input?.understand) return { ok: false, reason: 'understand' }

  const dates = listBookableDateKeys({
    now: input.now,
    timeZone: info.timeZone,
    bookingWindowDays: info.bookingWindowDays,
  })
  if (!dates.includes(`${input.date ?? ''}`.slice(0, 10))) return { ok: false, reason: 'date' }

  const arrival = minutesToTime(timeToMinutes(input.time) ?? -1)
  if (!arrival || timeToMinutes(input.time) == null) return { ok: false, reason: 'time' }
  if (!isSlotAfterNotice({
    dateKey: input.date,
    time: arrival,
    now: input.now,
    minNoticeMinutes: info.minNoticeMinutes,
    timeZone: info.timeZone,
  })) return { ok: false, reason: 'time' }

  const daySeatings = (info.seatings ?? []).filter((seating) => {
    const days = Array.isArray(seating.daysOfWeek ?? seating.days_of_week)
      ? (seating.daysOfWeek ?? seating.days_of_week).map(Number)
      : [0, 1, 2, 3, 4, 5, 6]
    const weekday = weekdayIndexInTimeZone(input.date, info.timeZone)
    return seating?.isActive !== false && days.includes(weekday)
  })
  const assigned = assignSeatingForArrival(daySeatings, arrival)
  if (!assigned.seating) return { ok: false, reason: 'full' }
  const cards = availablePublicSlots({
    seatings: [assigned.seating],
    areas: info.areas,
    reservations: info.reservations,
    dateKey: input.date,
    party,
    now: input.now,
    timeZone: info.timeZone,
    minNoticeMinutes: info.minNoticeMinutes,
    dailyOnlineCovers: info.dailyOnlineCovers,
  })
  const card = cards[0]
  if (!card || card.state === 'full') return { ok: false, reason: 'full' }
  const area = card.areas.find((entry) => entry.id === input.areaId)
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
      time: arrival,
      seatingId: assigned.seating.id,
      seatingName: assigned.seating.name,
      endTime: card.endTime,
      contained: assigned.contained,
      areaId: area.id,
      areaLabel: area.label,
      smoking: Boolean(area.smoking),
      status: publicBookingStatus(info.confirmationMethod),
      confirmationMethod: info.confirmationMethod,
    },
  }
}

export function formatPublicBookingWhen(dateKey, time, locale = 'en', timeZone = 'UTC') {
  const key = `${dateKey ?? ''}`.slice(0, 10)
  const clock = `${time ?? ''}`.trim()
  const at = new Date(`${key}T12:00:00Z`)
  if (!key || Number.isNaN(at.getTime())) return clock || key
  const tag = locale === 'el' ? 'el-GR' : 'en-GB'
  let parts = []
  try {
    parts = new Intl.DateTimeFormat(tag, {
      timeZone: timeZone || 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).formatToParts(at)
  } catch {
    parts = new Intl.DateTimeFormat(tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).formatToParts(at)
  }
  const value = (type) => parts.find((part) => part.type === type)?.value || ''
  const day = `${value('weekday')} ${value('day')} ${value('month')}`.trim()
  return clock ? `${day} · ${clock}` : day
}

export function confirmationCopyKey(method) {
  if (method === 'instant') return 'Your reservation is confirmed.'
  if (method === 'email') return 'Check your email to confirm this reservation.'
  return 'The venue will call you to confirm.'
}

export function seatingEndNotice(start, end, locale = 'en') {
  if (!start || !end) return ''
  const window = `${start}–${end}`
  if (locale === 'el') {
    return `Η κράτησή σας είναι για το seating ${window}. Παρακαλούμε το τραπέζι να είναι ελεύθερο στις ${end} για τους επόμενους επισκέπτες.`
  }
  return `Your booking is for the ${window} seating. Please have the table free by ${end} for the next guests.`
}
