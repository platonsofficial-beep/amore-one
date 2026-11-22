const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const DEFAULT_DURATION = 120

function formatMinutesAsTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function normalizeClock(value) {
  const match = `${value ?? ''}`.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function clockMinutes(value) {
  const clock = normalizeClock(value)
  if (!clock) return null
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

function isWeekdayIndex(day) {
  return Number.isInteger(day) && day >= 0 && day <= 6
}

function readDays(seating) {
  const raw = seating?.daysOfWeek ?? seating?.days_of_week
  if (!Array.isArray(raw)) return [...ALL_DAYS]
  const days = [...new Set(raw.map(Number).filter(isWeekdayIndex))].sort((left, right) => left - right)
  return days.length ? days : [...ALL_DAYS]
}

function readSeating(seating) {
  if (!seating || typeof seating !== 'object') return null
  const startTime = normalizeClock(seating.startTime ?? seating.start_time)
  if (!startTime) return null
  const rawDuration = Number(seating.durationMinutes ?? seating.duration_minutes)
  const durationMinutes = Number.isFinite(rawDuration)
    ? Math.max(15, Math.min(480, rawDuration || DEFAULT_DURATION))
    : DEFAULT_DURATION
  return {
    startTime,
    durationMinutes,
    daysOfWeek: readDays(seating),
    dayHours: seating.dayHours ?? seating.day_hours ?? null,
  }
}

function legacyDayRow(seating, day) {
  const startMinutes = clockMinutes(seating.startTime) ?? 19 * 60
  return {
    open: seating.daysOfWeek.includes(day),
    start: seating.startTime,
    end: formatMinutesAsTime(startMinutes + seating.durationMinutes),
    lastArrival: '',
  }
}

export function weekdayFromDateKey(dateKey) {
  const normalized = `${dateKey ?? ''}`.slice(0, 10)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getDay()
}

export function normalizeDayHours(raw, seating) {
  const normalized = readSeating(seating)
  if (!normalized) return {}
  const source = raw && typeof raw === 'object' ? raw : {}
  const hours = {}
  ALL_DAYS.forEach((day) => {
    const legacy = legacyDayRow(normalized, day)
    const spec = source[day] ?? source[String(day)]
    if (!spec || typeof spec !== 'object') {
      hours[day] = legacy
      return
    }
    const start = normalizeClock(spec.start ?? spec.startTime) || legacy.start
    let end = normalizeClock(spec.end ?? spec.endTime) || legacy.end
    const startMinutes = clockMinutes(start)
    let endMinutes = clockMinutes(end)
    if (startMinutes != null && (endMinutes == null || endMinutes <= startMinutes)) {
      endMinutes = Math.min(startMinutes + 15, (24 * 60) - 1)
      end = formatMinutesAsTime(endMinutes)
    }
    hours[day] = {
      open: spec.open === undefined ? legacy.open : Boolean(spec.open),
      start,
      end,
      lastArrival: normalizeClock(spec.lastArrival ?? spec.last_arrival),
    }
  })
  return hours
}

export function seatingScheduleForDate(seating, dateKey) {
  const normalized = readSeating(seating)
  const day = weekdayFromDateKey(dateKey)
  if (!normalized || day == null) return null
  const row = normalizeDayHours(normalized.dayHours, normalized)[day]
  const start = clockMinutes(row.start)
  let end = clockMinutes(row.end)
  if (start == null || end == null) return null
  if (end <= start) end = Math.min(start + 15, (24 * 60) - 1)
  let last = row.lastArrival ? clockMinutes(row.lastArrival) : end - 30
  if (last == null || last < start) last = start
  if (last > end) last = end
  return {
    open: row.open,
    start,
    end,
    last,
    startTime: row.start,
    endTime: formatMinutesAsTime(end),
    lastArrivalTime: formatMinutesAsTime(last),
  }
}

export function datedArrivalSlots(seating, dateKey) {
  const schedule = seatingScheduleForDate(seating, dateKey)
  if (!schedule?.open) return []
  const options = []
  for (let minute = schedule.start; minute <= schedule.last; minute += 15) {
    options.push(formatMinutesAsTime(minute))
  }
  return options
}

export function copyDayHours(hours, fromDay, toDays = []) {
  const source = hours?.[fromDay] ?? hours?.[String(fromDay)]
  if (!source) return hours
  const next = { ...hours }
  toDays.forEach((day) => {
    const key = Number(day)
    if (!Number.isInteger(key) || key === Number(fromDay)) return
    next[key] = { ...source }
  })
  return next
}
