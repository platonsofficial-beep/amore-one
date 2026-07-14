import { parseTimeToMinutes } from './shiftHoursUtils'

export const EMPLOYEE_AVAILABILITY_STATUS = Object.freeze({
  AVAILABLE: Object.freeze({
    key: 'AVAILABLE',
    label: 'Available',
  }),
  UNAVAILABLE: Object.freeze({
    key: 'UNAVAILABLE',
    label: 'Unavailable',
  }),
  PREFERRED: Object.freeze({
    key: 'PREFERRED',
    label: 'Preferred',
  }),
})

export const EMPLOYEE_AVAILABILITY_DAYS = Object.freeze([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
])

const DAY_LABELS = Object.freeze({
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
})

const DAY_ABBREVIATIONS = Object.freeze({
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
})

const DAY_ALIASES = Object.freeze({
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  weds: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
})

const STATUS_KEYS = new Set(Object.keys(EMPLOYEE_AVAILABILITY_STATUS))

function normalizeDayOfWeek(value) {
  const raw = `${value ?? ''}`.trim().toLowerCase()
  if (!raw) return null

  if (DAY_ALIASES[raw]) return DAY_ALIASES[raw]

  const numeric = Number(raw)
  if (Number.isInteger(numeric)) {
    if (numeric >= 1 && numeric <= 7) {
      return EMPLOYEE_AVAILABILITY_DAYS[numeric - 1]
    }
    if (numeric >= 0 && numeric <= 6) {
      const sundayFirst = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      return sundayFirst[numeric] ?? null
    }
  }

  return null
}

function normalizeStatus(value) {
  const raw = `${value ?? ''}`.trim().toUpperCase()
  if (!raw || !STATUS_KEYS.has(raw)) {
    return EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key
  }
  return raw
}

function normalizeTimeValue(value) {
  const raw = `${value ?? ''}`.trim()
  if (!raw) return null

  const minutes = parseTimeToMinutes(raw)
  if (minutes === null) return null

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function normalizeNote(value) {
  const raw = `${value ?? ''}`.trim()
  return raw || null
}

function createDefaultDayEntry(dayOfWeek) {
  return {
    dayOfWeek,
    status: EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key,
    startTime: null,
    endTime: null,
    note: null,
  }
}

function normalizeDayEntry(entry, fallbackDayOfWeek = null) {
  const dayOfWeek = normalizeDayOfWeek(entry?.dayOfWeek ?? entry?.day ?? fallbackDayOfWeek)
  if (!dayOfWeek) return null

  const startTime = normalizeTimeValue(entry?.startTime ?? entry?.start_time)
  const endTime = normalizeTimeValue(entry?.endTime ?? entry?.end_time)

  return {
    dayOfWeek,
    status: normalizeStatus(entry?.status),
    startTime,
    endTime,
    note: normalizeNote(entry?.note),
  }
}

function readWeekDays(input) {
  if (Array.isArray(input?.days)) return input.days
  if (Array.isArray(input)) return input
  return []
}

export function createEmptyAvailabilityWeek() {
  return {
    days: EMPLOYEE_AVAILABILITY_DAYS.map((dayOfWeek) => createDefaultDayEntry(dayOfWeek)),
  }
}

export function normalizeAvailabilityWeek(input) {
  const sourceDays = readWeekDays(input)
  const dayMap = new Map()

  sourceDays.forEach((entry) => {
    const normalizedEntry = normalizeDayEntry(entry)
    if (!normalizedEntry) return
    if (dayMap.has(normalizedEntry.dayOfWeek)) return
    dayMap.set(normalizedEntry.dayOfWeek, normalizedEntry)
  })

  const days = EMPLOYEE_AVAILABILITY_DAYS.map((dayOfWeek) => (
    dayMap.get(dayOfWeek) ?? createDefaultDayEntry(dayOfWeek)
  ))

  return { days }
}

export function getAvailabilityForDay(week, dayOfWeek) {
  const normalizedWeek = normalizeAvailabilityWeek(week)
  const normalizedDay = normalizeDayOfWeek(dayOfWeek)
  if (!normalizedDay) return null

  return normalizedWeek.days.find((entry) => entry.dayOfWeek === normalizedDay) ?? null
}

export function setAvailabilityForDay(week, dayOfWeek, patch = {}) {
  const normalizedWeek = normalizeAvailabilityWeek(week)
  const normalizedDay = normalizeDayOfWeek(dayOfWeek)
  if (!normalizedDay) return normalizedWeek

  const currentEntry = getAvailabilityForDay(normalizedWeek, normalizedDay) ?? createDefaultDayEntry(normalizedDay)
  const mergedEntry = normalizeDayEntry({
    ...currentEntry,
    ...patch,
    dayOfWeek: normalizedDay,
  }, normalizedDay)

  return {
    days: normalizedWeek.days.map((entry) => (
      entry.dayOfWeek === normalizedDay ? mergedEntry : { ...entry }
    )),
  }
}

export function validateAvailabilityWeek(week) {
  const normalizedWeek = normalizeAvailabilityWeek(week)
  const issues = []
  const seenDays = new Set()

  readWeekDays(week).forEach((entry, index) => {
    const dayOfWeek = normalizeDayOfWeek(entry?.dayOfWeek ?? entry?.day)
    if (!dayOfWeek) {
      issues.push({
        code: 'invalid_day',
        message: `Entry at index ${index} has an invalid dayOfWeek`,
        index,
      })
      return
    }

    if (seenDays.has(dayOfWeek)) {
      issues.push({
        code: 'duplicate_day',
        message: `Duplicate availability entry for ${DAY_LABELS[dayOfWeek]}`,
        dayOfWeek,
        index,
      })
      return
    }

    seenDays.add(dayOfWeek)

    const rawStatus = `${entry?.status ?? ''}`.trim().toUpperCase()
    if (rawStatus && !STATUS_KEYS.has(rawStatus)) {
      issues.push({
        code: 'unknown_status',
        message: `Unknown status "${entry?.status}" normalized to AVAILABLE`,
        dayOfWeek,
        index,
      })
    }

    const startTime = `${entry?.startTime ?? entry?.start_time ?? ''}`.trim()
    const endTime = `${entry?.endTime ?? entry?.end_time ?? ''}`.trim()
    if (startTime && normalizeTimeValue(startTime) === null) {
      issues.push({
        code: 'invalid_start_time',
        message: `Invalid startTime "${startTime}" ignored`,
        dayOfWeek,
        index,
      })
    }
    if (endTime && normalizeTimeValue(endTime) === null) {
      issues.push({
        code: 'invalid_end_time',
        message: `Invalid endTime "${endTime}" ignored`,
        dayOfWeek,
        index,
      })
    }
  })

  if (normalizedWeek.days.length !== EMPLOYEE_AVAILABILITY_DAYS.length) {
    issues.push({
      code: 'invalid_day_count',
      message: 'Availability week must contain exactly 7 days',
    })
  }

  const normalizedDaySet = new Set(normalizedWeek.days.map((entry) => entry.dayOfWeek))
  EMPLOYEE_AVAILABILITY_DAYS.forEach((dayOfWeek) => {
    if (!normalizedDaySet.has(dayOfWeek)) {
      issues.push({
        code: 'missing_day',
        message: `Missing availability entry for ${DAY_LABELS[dayOfWeek]}`,
        dayOfWeek,
      })
    }
  })

  return {
    isValid: issues.length === 0,
    issues,
    week: normalizedWeek,
  }
}

function isEveningPreferredEntry(entry) {
  if (entry.status !== EMPLOYEE_AVAILABILITY_STATUS.PREFERRED.key) return false
  if (!entry.startTime && !entry.endTime) return false

  const startMinutes = parseTimeToMinutes(entry.startTime)
  if (startMinutes !== null && startMinutes >= 17 * 60) return true

  const endMinutes = parseTimeToMinutes(entry.endTime)
  return endMinutes !== null && endMinutes >= 18 * 60
}

function formatDayLabel(dayOfWeek) {
  return DAY_LABELS[dayOfWeek] ?? dayOfWeek
}

function formatDayAbbreviation(dayOfWeek) {
  return DAY_ABBREVIATIONS[dayOfWeek] ?? dayOfWeek
}

function formatDayRange(dayKeys) {
  if (dayKeys.length === 0) return ''
  if (dayKeys.length === 1) return formatDayAbbreviation(dayKeys[0])
  if (dayKeys.length === 2) {
    return `${formatDayAbbreviation(dayKeys[0])} & ${formatDayAbbreviation(dayKeys[1])}`
  }
  return `${formatDayAbbreviation(dayKeys[0])}–${formatDayAbbreviation(dayKeys[dayKeys.length - 1])}`
}

function groupConsecutiveDays(dayKeys) {
  if (dayKeys.length === 0) return []

  const indexByDay = new Map(EMPLOYEE_AVAILABILITY_DAYS.map((day, index) => [day, index]))
  const sorted = [...dayKeys].sort((left, right) => indexByDay.get(left) - indexByDay.get(right))
  const groups = [[sorted[0]]]

  for (let index = 1; index < sorted.length; index += 1) {
    const day = sorted[index]
    const previousDay = sorted[index - 1]
    const previousIndex = indexByDay.get(previousDay)
    const currentIndex = indexByDay.get(day)

    if (currentIndex === previousIndex + 1) {
      groups[groups.length - 1].push(day)
    } else {
      groups.push([day])
    }
  }

  return groups
}

function isDefaultAvailableEntry(entry) {
  return entry.status === EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key
    && !entry.startTime
    && !entry.endTime
    && !entry.note
}

function summarizeStatusDayGroups(entries, statusKey) {
  const dayKeys = entries
    .filter((entry) => entry.status === statusKey)
    .map((entry) => entry.dayOfWeek)

  return groupConsecutiveDays(dayKeys)
}

export function summarizeAvailabilityWeek(week) {
  const normalizedWeek = normalizeAvailabilityWeek(week)
  const entries = normalizedWeek.days

  if (entries.every(isDefaultAvailableEntry)) {
    return 'Available every day'
  }

  const unavailableCount = entries.filter((entry) => (
    entry.status === EMPLOYEE_AVAILABILITY_STATUS.UNAVAILABLE.key
  )).length
  const preferredCount = entries.filter((entry) => (
    entry.status === EMPLOYEE_AVAILABILITY_STATUS.PREFERRED.key
  )).length
  const availableWithDetailsCount = entries.filter((entry) => (
    entry.status === EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key && !isDefaultAvailableEntry(entry)
  )).length

  if (unavailableCount === entries.length) {
    return 'Unavailable every day'
  }

  if (preferredCount === entries.length) {
    return 'Preferred every day'
  }

  const hasUnavailable = unavailableCount > 0
  const hasPreferred = preferredCount > 0
  const hasAvailableWithDetails = availableWithDetailsCount > 0
  const patternCount = [hasUnavailable, hasPreferred, hasAvailableWithDetails].filter(Boolean).length

  if (patternCount > 1) {
    return 'Mixed availability'
  }

  if (hasUnavailable) {
    const groups = summarizeStatusDayGroups(entries, EMPLOYEE_AVAILABILITY_STATUS.UNAVAILABLE.key)

    if (groups.length === 1) {
      const group = groups[0]
      if (group.length === 1) {
        return `Unavailable ${formatDayLabel(group[0])}`
      }
      return `Unavailable ${formatDayRange(group)}`
    }

    return 'Mixed availability'
  }

  if (hasPreferred) {
    const preferredEntries = entries.filter((entry) => (
      entry.status === EMPLOYEE_AVAILABILITY_STATUS.PREFERRED.key
    ))

    if (preferredEntries.length === 1) {
      const entry = preferredEntries[0]
      if (isEveningPreferredEntry(entry)) {
        return `Preferred ${formatDayLabel(entry.dayOfWeek)} evening`
      }
      return `Preferred ${formatDayLabel(entry.dayOfWeek)}`
    }

    const allEvening = preferredEntries.every(isEveningPreferredEntry)
    if (allEvening) {
      const groups = groupConsecutiveDays(preferredEntries.map((entry) => entry.dayOfWeek))
      if (groups.length === 1 && groups[0].length === 1) {
        return `Preferred ${formatDayLabel(groups[0][0])} evening`
      }
    }

    return 'Mixed availability'
  }

  return 'Mixed availability'
}
