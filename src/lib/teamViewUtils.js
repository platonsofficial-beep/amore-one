import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { getCurrentDateKey } from './currentDateUtils'

function normalizeDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

export function buildTeamTodayStatus({
  liveFloor = {},
  snapshot = {},
} = {}) {
  if (liveFloor.state === 'unpublished') {
    return {
      scheduleLabel: 'Schedule',
      scheduleValue: 'Not published yet',
      nextShiftLabel: 'Next shift',
      nextShiftValue: 'No published shifts',
      coverageLabel: 'Coverage',
      coverageValue: 'Waiting for schedule',
      coverageTone: 'neutral',
    }
  }

  let workingNow = 'No one on shift'

  if (liveFloor.state === 'live') {
    const count = Number(liveFloor.onShiftCount) || 0
    workingNow = count === 1 ? '1 person working' : `${count} people working`
  }

  let nextShift = 'No more shifts today'

  if (liveFloor.state === 'idle' && liveFloor.nextShiftStartLabel) {
    nextShift = liveFloor.nextShiftStartLabel
  } else if (liveFloor.state === 'live' && liveFloor.nextShiftStartLabel) {
    nextShift = liveFloor.nextShiftStartLabel
  }

  const issues = Number(snapshot.issues) || 0

  return {
    scheduleLabel: 'Working now',
    scheduleValue: workingNow,
    nextShiftLabel: 'Next shift',
    nextShiftValue: nextShift,
    coverageLabel: 'Coverage',
    coverageValue: issues === 0 ? 'All covered' : 'Missing coverage',
    coverageTone: issues === 0 ? 'ok' : 'warn',
  }
}

export function buildEmployeeTodayShiftLookup({
  shifts = [],
  todayKey = getCurrentDateKey(),
} = {}) {
  const lookup = new Map()
  const todayShifts = (shifts ?? []).filter(
    (shift) => normalizeDate(shift.date) === todayKey && shift.employeeId,
  )
  const shiftsByEmployee = new Map()

  todayShifts.forEach((shift) => {
    const employeeId = String(shift.employeeId)
    if (!shiftsByEmployee.has(employeeId)) {
      shiftsByEmployee.set(employeeId, [])
    }
    shiftsByEmployee.get(employeeId).push(shift)
  })

  shiftsByEmployee.forEach((employeeShifts, employeeId) => {
    const sortedShifts = [...employeeShifts].sort((left, right) => (
      (parseTimeToMinutes(left.startTime) ?? 0) - (parseTimeToMinutes(right.startTime) ?? 0)
    ))
    const shift = sortedShifts[0]
    const startTimeLabel = formatTime24(normalizeTimeValue(shift.startTime))
    const endTimeLabel = formatTime24(normalizeTimeValue(shift.endTime))
    const shiftLabel = startTimeLabel && endTimeLabel
      ? `${startTimeLabel} - ${endTimeLabel}`
      : startTimeLabel || 'Scheduled'

    lookup.set(employeeId, shiftLabel)
  })

  return lookup
}
