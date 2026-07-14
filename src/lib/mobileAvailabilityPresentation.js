import {
  EMPLOYEE_AVAILABILITY_DAYS,
  EMPLOYEE_AVAILABILITY_STATUS,
  normalizeAvailabilityWeek,
} from './employeeAvailabilityUtils'

export const MOBILE_AVAILABILITY_STATUS_OPTIONS = Object.freeze([
  {
    value: EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key,
    label: 'Available',
  },
  {
    value: EMPLOYEE_AVAILABILITY_STATUS.PREFERRED.key,
    label: 'Preferred',
  },
  {
    value: EMPLOYEE_AVAILABILITY_STATUS.UNAVAILABLE.key,
    label: 'Unavailable',
  },
])

const DAY_TITLES = Object.freeze({
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
})

export function getMobileAvailabilityDayTitle(dayOfWeek) {
  const normalized = `${dayOfWeek ?? ''}`.trim().toLowerCase()
  return DAY_TITLES[normalized] ?? normalized
}

export function cloneAvailabilityWeek(week) {
  const normalized = normalizeAvailabilityWeek(week)
  return {
    days: normalized.days.map((entry) => ({ ...entry })),
  }
}

export function areAvailabilityWeeksEqual(left, right) {
  const normalizedLeft = normalizeAvailabilityWeek(left)
  const normalizedRight = normalizeAvailabilityWeek(right)

  return JSON.stringify(normalizedLeft.days) === JSON.stringify(normalizedRight.days)
}

export function isAvailabilityWeekDirty(savedWeek, draftWeek) {
  return !areAvailabilityWeeksEqual(savedWeek, draftWeek)
}

export function getFriendlyAvailabilityError(error, fallback = 'Unable to update availability right now.') {
  const message = `${error?.message ?? ''}`.trim()
  if (!message) return fallback

  const lowered = message.toLowerCase()
  if (lowered.includes('employee is required') || lowered.includes('link your employee')) {
    return 'Link your employee profile to manage availability.'
  }
  if (lowered.includes('week start date')) {
    return 'Choose a valid week before saving availability.'
  }
  if (lowered.includes('sign in')) {
    return 'Sign in to manage your availability.'
  }
  if (lowered.includes('not ready yet') || lowered.includes('does not exist')) {
    return 'Availability is not ready yet. Try again later.'
  }
  if (lowered.includes('row-level security') || lowered.includes('permission denied')) {
    return 'You can only edit your own availability.'
  }

  return fallback
}

export function orderAvailabilityDays(days = []) {
  const normalized = normalizeAvailabilityWeek({ days })
  return normalized.days
}

export function buildAvailabilitySavePayload({
  workspaceId,
  employeeId,
  weekStartDate,
  draftWeek,
}) {
  return {
    workspaceId: `${workspaceId ?? ''}`.trim(),
    employeeId: `${employeeId ?? ''}`.trim(),
    weekStartDate: `${weekStartDate ?? ''}`.trim(),
    week: normalizeAvailabilityWeek(draftWeek),
  }
}
