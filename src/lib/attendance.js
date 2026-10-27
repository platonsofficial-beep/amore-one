import { getDateKeyInTimeZone, getWeekDateKeys, getWeekStartDate } from './weekUtils'

export const LOCATION_CONSENT_STORAGE_KEY = 'one.attendance.locationConsent.v1'

export const LOCATION_CONSENT_TEXT = 'When you press Clock in or Clock out, ONE checks your phone’s location once to confirm you are at the venue. We do not track you and we do not save where you are. We only keep whether you were inside or outside, and the distance in metres.'

export const OFFLINE_MESSAGE = 'Needs internet connection.'

export const NO_VENUE_LOCATION_MESSAGE = 'Venue location is not set yet. Ask the owner to set it in Settings > Venue.'

export const LOCATION_OFF_MESSAGE = 'Location is off. Turn it on in Settings > Safari/Chrome > Location'

export const POOR_ACCURACY_MESSAGE = 'GPS is not accurate enough, move near a window or send a request.'

export const DEFAULT_RADIUS_M = 50
export const DEFAULT_LATE_GRACE_MINUTES = 10
export const RADIUS_CHOICES_M = [30, 50, 100, 200]
export const NO_SHOW_AFTER_MINUTES = 60

const MANAGER_REQUEST_REASONS = new Set(['outside', 'poor_accuracy', 'no_location'])

export function hasLocationConsent(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(LOCATION_CONSENT_STORAGE_KEY) === 'agreed'
  } catch {
    return false
  }
}

export function saveLocationConsent(storage = globalThis.localStorage) {
  storage?.setItem(LOCATION_CONSENT_STORAGE_KEY, 'agreed')
}

export function isOffline(online = globalThis.navigator?.onLine) {
  return online === false
}

export function venueLocationIsSet(settings) {
  if (settings?.venue_lat == null || settings?.venue_lng == null) return false
  const lat = Number(settings.venue_lat)
  const lng = Number(settings.venue_lng)
  return Number.isFinite(lat) && Number.isFinite(lng)
}

export function failureMessage(result) {
  const reason = `${result?.reason ?? ''}`.trim()
  if (reason === 'outside') {
    const distance = Number(result?.distance_m)
    const shown = Number.isFinite(distance) ? distance : '—'
    return `You're not at the venue (about ${shown} m away).`
  }
  if (reason === 'poor_accuracy') return POOR_ACCURACY_MESSAGE
  if (reason === 'no_location') return LOCATION_OFF_MESSAGE
  if (reason === 'already_clocked_in') return 'You are already clocked in.'
  if (reason === 'not_clocked_in') return 'Clock in before you clock out.'
  if (reason === 'already_on_break') return 'You are already on a break.'
  if (reason === 'not_on_break') return 'You are not on a break.'
  return 'Something went wrong. Try again.'
}

export function needsManagerRequest(result) {
  return result?.ok === false && MANAGER_REQUEST_REASONS.has(`${result?.reason ?? ''}`)
}

export function formatClockTime(date, timeZone = '') {
  const instant = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(instant.getTime())) return ''
  const zone = `${timeZone ?? ''}`.trim()
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(zone ? { timeZone: zone } : {}),
  }).format(instant)
}

export function clockInMessage(result, clockedAt = new Date(), timeZone = '') {
  if (!result?.ok) return failureMessage(result)
  const time = formatClockTime(result.clockedAt ?? clockedAt, timeZone)
  const parts = [`You are clocked in at ${time}.`]
  if (result.is_late) {
    const late = Number(result.late_minutes) || 0
    parts.push(`Late by ${late} min.`)
  }
  if (result.pending_approval) parts.push('Sent to your manager for approval.')
  return parts.join(' ')
}

export function clockOutMessage(result) {
  if (!result?.ok) return failureMessage(result)
  if (result.pending_approval) return 'You are clocked out. Sent to your manager for approval.'
  return 'You are clocked out.'
}

export function attendanceErrorMessage(error) {
  const message = `${error?.message ?? ''}`.trim()
  const lowered = message.toLowerCase()
  if (!message || lowered.includes('failed to fetch') || lowered.includes('network')) {
    return OFFLINE_MESSAGE
  }
  if (lowered.includes('owner_only')) return 'Only the owner can save the venue location.'
  if (lowered.includes('note_required') || lowered.includes('reason_required')) {
    return 'Add a note so the change is recorded.'
  }
  if (lowered.includes('cannot_edit_own_entry')) return 'You cannot change your own time. The owner can.'
  if (lowered.includes('cannot_decide_own')) return 'You cannot approve your own request. The owner can.'
  if (lowered.includes('already_decided')) return 'This request was already decided.'
  if (lowered.includes('invalid_times')) return 'Clock out has to be after clock in.'
  if (lowered.includes('not_a_member') || lowered.includes('forbidden')) {
    return 'You cannot do that with your access.'
  }
  return message
}

export function formatHoursMinutes(totalMinutes) {
  const rounded = Math.round(Number(totalMinutes) || 0)
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  if (hours === 0) return `${sign}${minutes}m`
  if (minutes === 0) return `${sign}${hours}h`
  return `${sign}${hours}h ${minutes}m`
}

export function formatSignedHours(differenceMinutes) {
  const rounded = Math.round(Number(differenceMinutes) || 0)
  if (rounded > 0) return `+${formatHoursMinutes(rounded)}`
  return formatHoursMinutes(rounded)
}

export function formatWorkingLabel(totalMinutes) {
  return `Working ${formatHoursMinutes(totalMinutes)}`
}

function timeToMinutes(value) {
  const match = `${value ?? ''}`.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function isOvernightShift(startTime, endTime) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start == null || end == null) return false
  return end < start
}

export function shiftDurationMinutes(startTime, endTime) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start == null || end == null || start === end) return 0
  if (end < start) return (24 * 60 - start) + end
  return end - start
}

export function shiftDateKey(shift) {
  return `${shift?.shift_date ?? shift?.date ?? ''}`.trim().slice(0, 10)
}

export function shiftStartTime(shift) {
  return `${shift?.start_time ?? shift?.startTime ?? ''}`.trim().slice(0, 5)
}

export function shiftEndTime(shift) {
  return `${shift?.end_time ?? shift?.endTime ?? ''}`.trim().slice(0, 5)
}

export function shiftPlaceLabel(shift) {
  const area = `${shift?.area ?? ''}`.trim()
  if (area) return area
  const role = `${shift?.role ?? ''}`.trim()
  return role
}

export function breakMinutes(breaks, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return (breaks ?? []).reduce((sum, item) => {
    const start = new Date(item?.start_at ?? item?.startAt ?? '').getTime()
    if (!Number.isFinite(start)) return sum
    const endRaw = item?.end_at ?? item?.endAt
    const end = endRaw ? new Date(endRaw).getTime() : nowMs
    if (!Number.isFinite(end) || end < start) return sum
    return sum + Math.round((end - start) / 60000)
  }, 0)
}

export function actualWorkedMinutes(entry, breaks = [], now = new Date()) {
  if (!entry?.clock_in_at) return 0
  const start = new Date(entry.clock_in_at).getTime()
  if (!Number.isFinite(start)) return 0
  const end = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : (now instanceof Date ? now.getTime() : new Date(now).getTime())
  if (!Number.isFinite(end) || end < start) return 0
  const gross = Math.round((end - start) / 60000)
  return Math.max(0, gross - breakMinutes(breaks, now))
}

export function isOpenEntry(entry) {
  return Boolean(entry) && !entry.clock_out_at
}

export function isOpenBreak(item) {
  return Boolean(item) && !item.end_at
}

export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = `${dateKey ?? ''}`.split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function zonedDateTime(dateKey, time, timeZone = 'Europe/Nicosia') {
  const [year, month, day] = `${dateKey ?? ''}`.split('-').map(Number)
  const [hour, minute] = `${time ?? ''}`.split(':').map(Number)
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null

  const zone = `${timeZone ?? ''}`.trim() || 'Europe/Nicosia'
  let guess = Date.UTC(year, month - 1, day, hour, minute)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess))
    const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    const seen = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute))
    const wanted = Date.UTC(year, month - 1, day, hour, minute)
    const delta = wanted - seen
    if (delta === 0) break
    guess += delta
  }
  return new Date(guess)
}

export function shiftBounds(shift, timeZone = 'Europe/Nicosia') {
  const dateKey = shiftDateKey(shift)
  const start = zonedDateTime(dateKey, shiftStartTime(shift), timeZone)
  let end = zonedDateTime(dateKey, shiftEndTime(shift), timeZone)
  if (!start || !end) return null
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }
  return { start, end }
}

export function classifyUnclockedShift(shift, {
  now = new Date(),
  graceMinutes = DEFAULT_LATE_GRACE_MINUTES,
  timeZone = 'Europe/Nicosia',
} = {}) {
  const bounds = shiftBounds(shift, timeZone)
  if (!bounds) return 'upcoming'
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (nowMs < bounds.start.getTime()) return 'upcoming'
  const minutesAfterStart = Math.floor((nowMs - bounds.start.getTime()) / 60000)
  if (nowMs >= bounds.end.getTime() || minutesAfterStart >= NO_SHOW_AFTER_MINUTES) return 'no-show'
  if (minutesAfterStart > graceMinutes) return 'late'
  return 'on-time'
}

export function describeTodayShift(shifts, {
  employeeId = '',
  todayKey = '',
  now = new Date(),
  timeZone = 'Europe/Nicosia',
} = {}) {
  const employeeKey = `${employeeId ?? ''}`.trim()
  const yesterday = addDaysToDateKey(todayKey, -1)
  const mine = (shifts ?? []).filter((shift) => {
    if (!employeeKey) return false
    return `${shift?.employee_id ?? shift?.employeeId ?? ''}` === employeeKey
  })

  const covering = mine.find((shift) => {
    const dateKey = shiftDateKey(shift)
    if (dateKey !== todayKey && dateKey !== yesterday) return false
    if (dateKey === yesterday && !isOvernightShift(shiftStartTime(shift), shiftEndTime(shift))) return false
    const bounds = shiftBounds(shift, timeZone)
    if (!bounds) return false
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
    return nowMs >= bounds.start.getTime() && nowMs < bounds.end.getTime()
  })

  const todayShifts = mine
    .filter((shift) => shiftDateKey(shift) === todayKey)
    .sort((left, right) => shiftStartTime(left).localeCompare(shiftStartTime(right)))

  const chosen = covering ?? todayShifts[0] ?? null
  if (!chosen) {
    return { label: 'No shift today (Unscheduled)', unscheduled: true, shift: null }
  }

  const place = shiftPlaceLabel(chosen)
  const range = `${shiftStartTime(chosen)}–${shiftEndTime(chosen)}`
  return {
    label: place ? `${range}, ${place}` : range,
    unscheduled: false,
    shift: chosen,
  }
}

export function summarizeHours({
  shifts = [],
  entries = [],
  breaksByEntryId = {},
  now = new Date(),
} = {}) {
  const scheduled = shifts.reduce(
    (sum, shift) => sum + shiftDurationMinutes(shiftStartTime(shift), shiftEndTime(shift)),
    0,
  )
  const actual = entries.reduce((sum, entry) => (
    sum + actualWorkedMinutes(entry, breaksByEntryId[entry.id] ?? [], now)
  ), 0)
  return {
    scheduled,
    actual,
    difference: actual - scheduled,
  }
}

export function weekDateKeys(now = new Date(), timeZone = '') {
  const start = getWeekStartDate(now, timeZone)
  return { weekStart: start, dates: getWeekDateKeys(start) }
}

export function indexBreaksByEntry(breaks) {
  const map = {}
  for (const item of breaks ?? []) {
    const entryId = `${item?.entry_id ?? ''}`
    if (!entryId) continue
    if (!map[entryId]) map[entryId] = []
    map[entryId].push(item)
  }
  return map
}

export function personKeyForEntry(entry) {
  return `${entry?.employee_id ?? entry?.member_id ?? entry?.id ?? ''}`
}

export function canDecideOwnAttendance({ isOwner = false, actorMemberId = '', targetMemberId = '' } = {}) {
  if (!`${targetMemberId ?? ''}`.trim()) return true
  if (`${actorMemberId ?? ''}` !== `${targetMemberId ?? ''}`) return true
  return Boolean(isOwner)
}

export function exceptionKindLabel(kind) {
  if (kind === 'outside_clock_in') return 'Outside clock in'
  if (kind === 'outside_clock_out') return 'Outside clock out'
  if (kind === 'missed_clock_out') return 'Missed clock out'
  if (kind === 'edit_request') return 'Time change'
  return 'Request'
}

export function validateVenueSettings({ lat, lng, radiusM, lateGraceMinutes }) {
  const latText = `${lat ?? ''}`.trim()
  const lngText = `${lng ?? ''}`.trim()
  const radius = Number(radiusM)
  const grace = Number(lateGraceMinutes)
  if ((latText && !lngText) || (!latText && lngText)) {
    return { ok: false, message: 'Enter both latitude and longitude.' }
  }
  const latNumber = latText ? Number(latText) : null
  const lngNumber = lngText ? Number(lngText) : null
  if (latNumber != null && (!Number.isFinite(latNumber) || latNumber < -90 || latNumber > 90)) {
    return { ok: false, message: 'Latitude must be between -90 and 90.' }
  }
  if (lngNumber != null && (!Number.isFinite(lngNumber) || lngNumber < -180 || lngNumber > 180)) {
    return { ok: false, message: 'Longitude must be between -180 and 180.' }
  }
  if (!Number.isInteger(radius) || radius < 25 || radius > 1000) {
    return { ok: false, message: 'Radius must be between 25 and 1000 metres.' }
  }
  if (!Number.isInteger(grace) || grace < 0 || grace > 120) {
    return { ok: false, message: 'Late grace must be between 0 and 120 minutes.' }
  }
  return {
    ok: true,
    lat: latNumber,
    lng: lngNumber,
    radiusM: radius,
    lateGraceMinutes: grace,
  }
}

export function dateKeyInZone(date, timeZone) {
  return getDateKeyInTimeZone(date instanceof Date ? date : new Date(date), timeZone || 'Europe/Nicosia')
}

export function toDateTimeLocalValue(iso, timeZone = '') {
  if (!iso) return ''
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return ''
  const zone = `${timeZone ?? ''}`.trim()
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(zone ? { timeZone: zone } : {}),
  }).formatToParts(instant)
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  if (!map.year || !map.hour) return ''
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

export function fromDateTimeLocalValue(value, timeZone = '') {
  const [dateKey, time] = `${value ?? ''}`.trim().split('T')
  if (!dateKey || !time) return null
  const instant = zonedDateTime(dateKey, time, timeZone || 'Europe/Nicosia')
  return instant ? instant.toISOString() : null
}
