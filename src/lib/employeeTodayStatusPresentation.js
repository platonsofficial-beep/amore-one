export function getEmployeeTodayStatusPillClass(key) {
  const normalized = `${key ?? 'not_scheduled'}`.trim().replace(/_/g, '-') || 'not-scheduled'
  return `team-people-today-status-pill team-people-today-status-pill--${normalized}`
}

function formatDisplayTime(timeValue) {
  const raw = `${timeValue ?? ''}`.trim()
  if (!raw) return ''

  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (match) {
    return `${String(match[1]).padStart(2, '0')}:${match[2]}`
  }

  return raw.slice(0, 5)
}

function formatShiftRange(shift) {
  if (!shift?.startTime || !shift?.endTime) return null

  const start = formatDisplayTime(shift.startTime)
  const end = formatDisplayTime(shift.endTime)
  if (!start || !end) return null

  return `${start}–${end}`
}

export function formatEmployeeTodayShiftSummary(result) {
  if (!result?.shiftsToday?.length) return '—'

  const ranges = result.shiftsToday
    .map((shift) => formatShiftRange(shift))
    .filter(Boolean)

  if (!ranges.length) return '—'

  return ranges.join(' · ')
}

export function buildEmployeeTodayStatusCardPresentation(result, { isLoading = false } = {}) {
  if (isLoading) {
    return {
      primaryLabel: 'Loading today status…',
      secondaryLabel: '',
      pillLabel: 'Loading…',
      toneKey: 'not_scheduled',
    }
  }

  if (!result || typeof result !== 'object') {
    return {
      primaryLabel: 'Not scheduled',
      secondaryLabel: 'Schedule not published',
      pillLabel: 'Not scheduled',
      toneKey: 'not_scheduled',
    }
  }

  const primaryLabel = `${result.label ?? 'Not scheduled'}`.trim() || 'Not scheduled'
  let secondaryLabel = ''

  switch (result.key) {
    case 'working_now':
      secondaryLabel = result.endsAt ? `Until ${formatDisplayTime(result.endsAt)}` : ''
      break
    case 'scheduled_later':
      secondaryLabel = result.startsAt ? `Starts ${formatDisplayTime(result.startsAt)}` : ''
      break
    case 'shift_completed':
      secondaryLabel = result.endsAt ? `Ended ${formatDisplayTime(result.endsAt)}` : ''
      break
    case 'day_off':
      secondaryLabel = 'No published shift today'
      break
    case 'not_scheduled':
      secondaryLabel = 'Schedule not published'
      break
    case 'on_leave':
      secondaryLabel = ''
      break
    default:
      secondaryLabel = ''
      break
  }

  return {
    primaryLabel,
    secondaryLabel,
    pillLabel: primaryLabel,
    toneKey: result.key || 'not_scheduled',
  }
}

export function buildEmployeeTodayStatusDrawerIdentity(result, { isLoading = false } = {}) {
  if (isLoading) {
    return {
      statusLabel: 'Loading today status…',
      todaySubtitle: 'Loading schedule…',
      pillLabel: 'Loading…',
      toneKey: 'not_scheduled',
    }
  }

  if (!result || typeof result !== 'object') {
    return {
      statusLabel: 'Not scheduled',
      todaySubtitle: 'Schedule not published',
      pillLabel: 'Not scheduled',
      toneKey: 'not_scheduled',
    }
  }

  const statusLabel = `${result.label ?? 'Not scheduled'}`.trim() || 'Not scheduled'
  let todaySubtitle = ''

  switch (result.key) {
    case 'working_now': {
      const range = formatShiftRange(result.currentShift)
      todaySubtitle = range
        ? `Today · ${range}`
        : (result.endsAt ? `Today · Until ${formatDisplayTime(result.endsAt)}` : 'Today')
      break
    }
    case 'scheduled_later':
      todaySubtitle = result.startsAt
        ? `Today · Starts ${formatDisplayTime(result.startsAt)}`
        : 'Today'
      break
    case 'shift_completed': {
      const range = formatShiftRange(result.completedShift ?? result.currentShift)
      todaySubtitle = range
        ? `Today · ${range}`
        : (result.endsAt ? `Today · Ended ${formatDisplayTime(result.endsAt)}` : 'Today')
      break
    }
    case 'day_off':
      todaySubtitle = 'No published shift today'
      break
    case 'not_scheduled':
      todaySubtitle = 'Schedule not published'
      break
    case 'on_leave':
      todaySubtitle = 'Approved leave today'
      break
    default:
      todaySubtitle = 'Today'
      break
  }

  return {
    statusLabel,
    todaySubtitle,
    pillLabel: statusLabel,
    toneKey: result.key || 'not_scheduled',
  }
}

export function countEmployeesWorkingNow(employees = [], employeeTodayStatusById = {}) {
  return employees.filter((employee) => {
    const id = `${employee?.id ?? ''}`.trim()
    if (!id) return false
    return employeeTodayStatusById[id]?.key === 'working_now'
  }).length
}
