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

function isTimeWithinShift(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false
  if (startMinutes === endMinutes) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

export function resolveTeamMemberShiftState({
  startMinutes = null,
  endMinutes = null,
  nowMinutes = 0,
  isOnShift = false,
} = {}) {
  if (isOnShift) {
    return { shiftState: 'working', shiftStateLabel: 'Working now' }
  }

  if (startMinutes === null || endMinutes === null) {
    return { shiftState: 'scheduled', shiftStateLabel: 'Scheduled' }
  }

  if (isTimeWithinShift(nowMinutes, startMinutes, endMinutes)) {
    return { shiftState: 'working', shiftStateLabel: 'Working now' }
  }

  if (endMinutes > startMinutes) {
    if (nowMinutes < startMinutes) {
      const startLabel = formatTime24(
        `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`,
      )
      return {
        shiftState: 'upcoming',
        shiftStateLabel: startLabel ? `Starts ${startLabel}` : 'Upcoming',
      }
    }

    if (nowMinutes >= endMinutes) {
      return { shiftState: 'finished', shiftStateLabel: 'Finished' }
    }
  } else if (nowMinutes >= endMinutes && nowMinutes < startMinutes) {
    const startLabel = formatTime24(
      `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`,
    )
    return {
      shiftState: 'upcoming',
      shiftStateLabel: startLabel ? `Starts ${startLabel}` : 'Upcoming',
    }
  }

  return { shiftState: 'scheduled', shiftStateLabel: 'Scheduled' }
}

export function enrichTeamTodayGroups(
  groups = [],
  { liveFloor = {}, now = new Date() } = {},
) {
  const onShiftShiftIds = new Set(
    (liveFloor.onShift ?? []).map((member) => String(member.shiftId)),
  )
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  return (groups ?? []).map((group) => ({
    ...group,
    members: (group.members ?? []).map((member) => ({
      ...member,
      ...resolveTeamMemberShiftState({
        startMinutes: member.startMinutes,
        endMinutes: member.endMinutes,
        nowMinutes,
        isOnShift: onShiftShiftIds.has(String(member.shiftId)),
      }),
    })),
  }))
}

export function applyCoverageHintsToGroups(groups = [], coverageBreakdown = {}) {
  const gaps = coverageBreakdown?.gaps ?? []
  if (!gaps.length) return groups

  const gapsByArea = new Map(
    gaps.map((gap) => [`${gap.area ?? ''}`.trim().toUpperCase(), gap]),
  )

  return (groups ?? []).map((group) => {
    const departmentKey = `${group.department ?? ''}`.trim().toUpperCase()
    const gap = gapsByArea.get(departmentKey)
      ?? gaps.find((entry) => departmentKey.includes(`${entry.area ?? ''}`.trim().toUpperCase()))

    if (!gap) return group

    const missing = Number(gap.missing) || 0
    return {
      ...group,
      coverageHint: missing > 0 ? `Missing ${missing}` : 'Understaffed',
      coverageTone: 'warn',
    }
  })
}

export function buildTeamTodayStatus({
  liveFloor = {},
  snapshot = {},
  coverageBreakdown = null,
} = {}) {
  if (liveFloor.state === 'unpublished') {
    return {
      scheduleLabel: 'Working now',
      scheduleValue: 'Schedule not published',
      nextShiftLabel: 'Next shift',
      nextShiftValue: 'No published shifts',
      coverageLabel: 'Coverage',
      coverageValue: 'Waiting for schedule',
      coverageTone: 'neutral',
      coverageDetail: '',
    }
  }

  let workingNow = 'No one on shift'

  if (liveFloor.state === 'live') {
    const count = Number(liveFloor.onShiftCount) || 0
    workingNow = count === 1 ? '1 team member on shift' : `${count} team members on shift`
  }

  let nextShift = 'No more shifts today'

  if (liveFloor.nextShiftStartLabel) {
    nextShift = `Starts at ${liveFloor.nextShiftStartLabel}`
  }

  const gapCount = Number(coverageBreakdown?.gapCount ?? snapshot.coverageGaps) || 0
  const coverageDetail = `${coverageBreakdown?.summaryLine ?? ''}`.trim()

  let coverageValue = 'All covered'
  let coverageTone = 'ok'

  if (gapCount > 0) {
    coverageValue = coverageDetail || (gapCount === 1 ? '1 coverage gap' : `${gapCount} coverage gaps`)
    coverageTone = 'warn'
  }

  return {
    scheduleLabel: 'Working now',
    scheduleValue: workingNow,
    nextShiftLabel: 'Next shift',
    nextShiftValue: nextShift,
    coverageLabel: 'Coverage',
    coverageValue,
    coverageTone,
    coverageDetail,
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
