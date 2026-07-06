import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { getCurrentDateKey } from './currentDateUtils'
import { isTaskOverdue } from './taskUtils'

function normalizeDate(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function normalizeTaskStatus(value) {
  const status = `${value ?? ''}`.trim().toLowerCase()
  return status === 'completed' ? 'completed' : 'active'
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function resolveShiftMember(shift, employeesById) {
  const employee = employeesById.get(String(shift.employeeId))
  const joinedEmployee = Array.isArray(shift.employees) ? shift.employees[0] : shift.employees
  const name = `${employee?.full_name ?? employee?.name ?? joinedEmployee?.full_name ?? joinedEmployee?.name ?? shift.employeeName ?? ''}`.trim()
  const startTimeLabel = formatTime24(normalizeTimeValue(shift.startTime))
  const endTimeLabel = formatTime24(normalizeTimeValue(shift.endTime))
  const department = `${shift.area ?? employee?.department ?? employee?.position ?? 'Other'}`.trim() || 'Other'

  return {
    shiftId: String(shift.id),
    name: name || 'Unassigned',
    department,
    shiftLabel: startTimeLabel && endTimeLabel ? `${startTimeLabel} – ${endTimeLabel}` : startTimeLabel || 'Scheduled',
    startMinutes: parseTimeToMinutes(shift.startTime) ?? 0,
  }
}

export function buildTeamTodayGroups({
  shifts = [],
  employees = [],
  todayKey = getCurrentDateKey(),
} = {}) {
  const employeesById = new Map((employees ?? []).map((employee) => [String(employee.id), employee]))
  const todayShifts = (shifts ?? []).filter((shift) => normalizeDate(shift.date) === todayKey && shift.employeeId)
  const groups = new Map()

  todayShifts.forEach((shift) => {
    const member = resolveShiftMember(shift, employeesById)
    const departmentKey = member.department.toUpperCase()
    if (!groups.has(departmentKey)) {
      groups.set(departmentKey, [])
    }
    groups.get(departmentKey).push(member)
  })

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([department, members]) => ({
      department,
      members: members.sort((left, right) => {
        if (left.startMinutes !== right.startMinutes) {
          return left.startMinutes - right.startMinutes
        }
        return left.name.localeCompare(right.name)
      }),
    }))
}

export function buildTodayStatusSummary({
  liveFloor = {},
  snapshot = {},
  reservationsSummary = {},
  reservationsConnected = false,
  reservationsFooter = {},
  tasksOverview = {},
  tasksConnected = false,
} = {}) {
  let serviceStatus = 'Preparing for service'
  if (liveFloor.state === 'live') {
    const count = Number(liveFloor.onShiftCount) || 0
    serviceStatus = count === 1 ? 'Service live · 1 on shift' : `Service live · ${count} on shift`
  } else if (liveFloor.state === 'unpublished') {
    serviceStatus = 'Schedule not published'
  } else if (liveFloor.state === 'idle' && liveFloor.nextShiftStartLabel) {
    serviceStatus = `Next shift at ${liveFloor.nextShiftStartLabel}`
  } else if (liveFloor.state === 'idle') {
    serviceStatus = 'Between shifts'
  }

  const scheduledStaff = Number(snapshot.scheduledStaff) || 0
  let teamSummary = 'No one scheduled today'
  if (scheduledStaff > 0) {
    teamSummary = scheduledStaff === 1
      ? '1 team member scheduled'
      : `${scheduledStaff} team members scheduled`
  }

  let reservationsSummaryLine = reservationsConnected ? 'No reservations today' : 'Reservations not connected'
  if (reservationsConnected) {
    const bookings = Number(reservationsSummary.bookings) || 0
    const guests = Number(reservationsSummary.guests) || 0
    if (bookings > 0) {
      reservationsSummaryLine = guests > 0
        ? `${bookings} booking${bookings === 1 ? '' : 's'} · ${guests} guest${guests === 1 ? '' : 's'}`
        : `${bookings} booking${bookings === 1 ? '' : 's'} today`
    }
    if (reservationsFooter?.type === 'next' && reservationsFooter.time) {
      reservationsSummaryLine = `${reservationsSummaryLine} · Next ${reservationsFooter.time}`
    }
  }

  let tasksSummary = tasksConnected ? 'No tasks due today' : 'Tasks not connected'
  if (tasksConnected && !tasksOverview.showEmptyToday) {
    const active = Number(tasksOverview.active) || 0
    const completedToday = Number(tasksOverview.completedToday) || 0
    const total = active + completedToday
    if (total > 0) {
      tasksSummary = `${completedToday} of ${total} complete`
      if (tasksOverview.overdue > 0) {
        tasksSummary = `${tasksSummary} · ${tasksOverview.overdue} overdue`
      }
    } else if (tasksOverview.overdue > 0) {
      tasksSummary = `${tasksOverview.overdue} overdue task${tasksOverview.overdue === 1 ? '' : 's'}`
    }
  }

  return {
    serviceStatus,
    teamSummary,
    reservationsSummaryLine,
    tasksSummary,
  }
}

export function buildTodayAttentionItems({
  stockAlerts = [],
  inventoryConnected = false,
  tasks = [],
  todayKey = getCurrentDateKey(),
  issuesSummary = {},
  snapshot = {},
} = {}) {
  const items = []

  if (inventoryConnected) {
    stockAlerts.forEach((item) => {
      items.push({
        key: `stock:${item.id}`,
        tone: item.severity === 'critical' ? 'critical' : 'warning',
        label: item.name,
        detail: item.severity === 'critical' ? 'Out of stock' : 'Low stock',
      })
    })
  }

  ;(tasks ?? []).forEach((task) => {
    if (normalizeTaskStatus(task?.status) !== 'active') return
    if (!isTaskOverdue(task, todayKey)) return
    const title = `${task?.title ?? task?.name ?? 'Task'}`.trim() || 'Task'
    items.push({
      key: `task:${task.id}`,
      tone: 'warning',
      label: title,
      detail: 'Overdue task',
    })
  })

  const overdueTaskItems = items.filter((item) => item.key.startsWith('task:'))
  if (overdueTaskItems.length > 5) {
    const keep = new Set(overdueTaskItems.slice(0, 5).map((item) => item.key))
    return items.filter((item) => !item.key.startsWith('task:') || keep.has(item.key))
  }

  const issueCount = Number(issuesSummary.count ?? snapshot.issues) || 0
  if (issueCount > 0) {
    items.push({
      key: 'schedule-issues',
      tone: issueCount >= 3 ? 'critical' : 'warning',
      label: issueCount === 1 ? 'Schedule issue' : `${issueCount} schedule issues`,
      detail: issuesSummary.message || 'Review today\'s schedule',
    })
  }

  return items
}

export function buildTodayServiceTimeline({
  timelineEvents = [],
  tasks = [],
  todayKey = getCurrentDateKey(),
  tasksConnected = false,
} = {}) {
  const events = [...(timelineEvents ?? [])]

  if (tasksConnected) {
    ;(tasks ?? []).forEach((task) => {
      if (normalizeTaskStatus(task?.status) !== 'active') return

      const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
      if (!dueDate || dueDate > todayKey) return

      const dueTime = normalizeTimeValue(task?.dueTime ?? task?.due_time)
      const title = `${task?.title ?? task?.name ?? 'Task'}`.trim() || 'Task'
      const isOverdue = isTaskOverdue(task, todayKey)

      events.push({
        key: `task:${task.id}`,
        time: dueTime || '23:59',
        timeLabel: dueTime ? formatTime24(dueTime) : 'Today',
        title: isOverdue ? `${title} · overdue` : title,
        note: `${task?.department ?? 'Task'}`.trim() || 'Task',
        type: 'task',
      })
    })
  }

  return events.sort((left, right) => (
    (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  ))
}
