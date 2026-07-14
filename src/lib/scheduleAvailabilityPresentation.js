import { EMPLOYEE_AVAILABILITY_STATUS } from './employeeAvailabilityUtils'

export const SCHEDULE_AVAILABILITY_INDICATORS = Object.freeze({
  available: Object.freeze({
    tone: 'available',
    label: 'Available',
  }),
  preferred: Object.freeze({
    tone: 'preferred',
    label: 'Preferred',
  }),
  unavailable: Object.freeze({
    tone: 'unavailable',
    label: 'Unavailable',
  }),
  empty: Object.freeze({
    tone: 'empty',
    label: 'No availability submitted',
  }),
  loading: Object.freeze({
    tone: 'loading',
    label: 'Loading availability',
  }),
})

const DAY_OF_WEEK_BY_INDEX = Object.freeze([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
])

export function getAvailabilityDayOfWeekFromDateKey(dateKey) {
  const match = `${dateKey ?? ''}`.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null

  const date = new Date(year, month - 1, day)
  return DAY_OF_WEEK_BY_INDEX[date.getDay()] ?? null
}

export function mapAvailabilityStatusToIndicator(status) {
  switch (`${status ?? ''}`.trim().toUpperCase()) {
    case EMPLOYEE_AVAILABILITY_STATUS.UNAVAILABLE.key:
      return SCHEDULE_AVAILABILITY_INDICATORS.unavailable
    case EMPLOYEE_AVAILABILITY_STATUS.PREFERRED.key:
      return SCHEDULE_AVAILABILITY_INDICATORS.preferred
    case EMPLOYEE_AVAILABILITY_STATUS.AVAILABLE.key:
    default:
      return SCHEDULE_AVAILABILITY_INDICATORS.available
  }
}

export function resolveScheduleAvailabilityDayIndicator({
  dayOfWeek,
  employeeAvailability = null,
  isLoading = false,
  loadFailed = false,
}) {
  if (isLoading) {
    return SCHEDULE_AVAILABILITY_INDICATORS.loading
  }

  if (loadFailed || !employeeAvailability?.hasSubmitted) {
    return SCHEDULE_AVAILABILITY_INDICATORS.empty
  }

  const entry = employeeAvailability?.week?.days?.find((day) => day.dayOfWeek === dayOfWeek) ?? null
  return mapAvailabilityStatusToIndicator(entry?.status)
}

export function buildScheduleAvailabilityDayIndicators({
  weekDays = [],
  employeeAvailability = null,
  isLoading = false,
  loadFailed = false,
}) {
  return weekDays.map((day) => {
    const dayOfWeek = getAvailabilityDayOfWeekFromDateKey(day.key)
    const indicator = resolveScheduleAvailabilityDayIndicator({
      dayOfWeek,
      employeeAvailability,
      isLoading,
      loadFailed,
    })

    return {
      dateKey: day.key,
      dayLabel: day.label,
      dayOfWeek,
      indicator,
    }
  })
}

export function buildScheduleAvailabilityLookupKey(workspaceId, weekStartDate, employeeIds = []) {
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedWeekStartDate = `${weekStartDate ?? ''}`.trim().slice(0, 10)
  const normalizedEmployeeIds = [...new Set(
    (employeeIds ?? []).map((employeeId) => `${employeeId ?? ''}`.trim()).filter(Boolean),
  )].sort().join('|')

  return `${normalizedWorkspaceId}|${normalizedWeekStartDate}|${normalizedEmployeeIds}`
}
