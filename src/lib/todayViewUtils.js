import { formatTime24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'
import { getCurrentDateKey } from './currentDateUtils'
import { buildScheduleAttentionDetail } from './operationalSnapshotUtils'
import { isTaskOverdue } from './taskUtils'
import {
  buildHostReservationAlerts,
  HOST_ALERT_TYPES,
} from './reservationServiceIntelligence'
import {
  filterAnnouncementsForUser,
  normalizeAnnouncementPriority,
} from './operationsAnnouncementUtils'

const DUE_TODAY_TASK_LIMIT = 3
const RESERVATION_ALERT_LIMIT = 3
const ANNOUNCEMENT_ATTENTION_LIMIT = 2

const TODAY_ATTENTION_TONE_RANK = {
  critical: 0,
  warning: 1,
  info: 2,
  default: 3,
}

const TODAY_ATTENTION_PRIORITY_RANK = {
  urgent: 0,
  reminder: 1,
}

export function getTodayAttentionBucket(item) {
  const key = `${item?.key ?? ''}`
  const tone = item?.tone ?? 'default'
  const priority = item?.priority ?? 'reminder'

  if (
    key.startsWith('reservation:')
    && (tone === 'critical' || priority === 'urgent')
  ) {
    return 0
  }

  if (key === 'schedule-issues') {
    return 0
  }

  if (key.startsWith('task:') && priority === 'urgent') {
    return 0
  }

  if (tone === 'critical' || key === 'stock-module:out') {
    return 0
  }

  if (key.startsWith('reservation:')) {
    return 1
  }

  if (key.startsWith('orders:awaiting') || key.startsWith('orders:partial')) {
    return 1
  }

  if (key.startsWith('task-due:')) {
    return 1
  }

  if (
    key.startsWith('stock:')
    || key.startsWith('stock-module:')
    || key.startsWith('orders:')
  ) {
    return 1
  }

  return 2
}

export function sortTodayAttentionItems(items = []) {
  return [...items].sort((left, right) => {
    const bucketDiff = getTodayAttentionBucket(left) - getTodayAttentionBucket(right)
    if (bucketDiff !== 0) return bucketDiff

    const toneDiff = (
      (TODAY_ATTENTION_TONE_RANK[left.tone] ?? 3)
      - (TODAY_ATTENTION_TONE_RANK[right.tone] ?? 3)
    )
    if (toneDiff !== 0) return toneDiff

    const priorityDiff = (
      (TODAY_ATTENTION_PRIORITY_RANK[left.priority] ?? 2)
      - (TODAY_ATTENTION_PRIORITY_RANK[right.priority] ?? 2)
    )
    if (priorityDiff !== 0) return priorityDiff

    return `${left.label ?? ''}`.localeCompare(`${right.label ?? ''}`)
  })
}

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

function resolveEmployeeRoleLabel(employee, shift) {
  const shiftRole = `${shift.role ?? ''}`.trim()
  if (shiftRole) return shiftRole

  const positionNames = Array.isArray(employee?.positions)
    ? employee.positions.map((position) => position.name).filter(Boolean)
    : []

  if (positionNames.length > 0) return positionNames.join(' · ')
  if (employee?.position) return `${employee.position}`.trim()
  return ''
}

function resolveShiftMember(shift, employeesById) {
  const employee = employeesById.get(String(shift.employeeId))
  const joinedEmployee = Array.isArray(shift.employees) ? shift.employees[0] : shift.employees
  const name = `${employee?.full_name ?? employee?.name ?? joinedEmployee?.full_name ?? joinedEmployee?.name ?? shift.employeeName ?? ''}`.trim()
  const startTimeLabel = formatTime24(normalizeTimeValue(shift.startTime))
  const endTimeLabel = formatTime24(normalizeTimeValue(shift.endTime))
  const department = `${shift.area ?? employee?.department ?? employee?.position ?? 'Other'}`.trim() || 'Other'
  const roleLabel = resolveEmployeeRoleLabel(employee, shift)

  return {
    shiftId: String(shift.id),
    employeeId: String(shift.employeeId),
    name: name || 'Unassigned',
    department,
    roleLabel,
    shiftLabel: startTimeLabel && endTimeLabel ? `${startTimeLabel} - ${endTimeLabel}` : startTimeLabel || 'Scheduled',
    startMinutes: parseTimeToMinutes(shift.startTime),
    endMinutes: parseTimeToMinutes(shift.endTime),
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
        const leftStart = left.startMinutes ?? Number.POSITIVE_INFINITY
        const rightStart = right.startMinutes ?? Number.POSITIVE_INFINITY
        if (leftStart !== rightStart) {
          return leftStart - rightStart
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
  serviceSnapshot = null,
  tasksOverview = {},
  tasksConnected = false,
  stockSummary = null,
  stockOrdersSummary = null,
  stockConnected = false,
  hasStockModuleData = false,
} = {}) {
  const workingCount = liveFloor.state === 'live' ? Number(liveFloor.onShiftCount) || 0 : 0
  let onShiftSummary = 'No one working now'
  if (liveFloor.state === 'unpublished') {
    onShiftSummary = 'Schedule not published'
  } else if (workingCount === 1) {
    onShiftSummary = '1 working now'
  } else if (workingCount > 1) {
    onShiftSummary = `${workingCount} working now`
  }

  const scheduledStaff = Number(snapshot.scheduledStaff) || 0
  const coverageGaps = Number(snapshot.coverageGaps) || 0
  let teamScheduledSummary = 'No shifts scheduled today'
  if (scheduledStaff === 1) {
    teamScheduledSummary = coverageGaps > 0
      ? `1 scheduled · ${coverageGaps} gap${coverageGaps === 1 ? '' : 's'}`
      : '1 scheduled today'
  } else if (scheduledStaff > 0) {
    teamScheduledSummary = coverageGaps > 0
      ? `${scheduledStaff} scheduled · ${coverageGaps} gap${coverageGaps === 1 ? '' : 's'}`
      : `${scheduledStaff} scheduled today`
  }

  let reservationsSummaryLine = reservationsConnected ? 'No reservations today' : 'Reservations not connected'
  if (reservationsConnected) {
    const bookings = Number(reservationsSummary.bookings) || 0
    const guests = Number(serviceSnapshot?.totalCovers ?? reservationsSummary.guests) || 0
    if (bookings > 0) {
      const coverLabel = guests > 0
        ? `${guests} cover${guests === 1 ? '' : 's'}`
        : ''
      reservationsSummaryLine = coverLabel
        ? `${bookings} booking${bookings === 1 ? '' : 's'} · ${coverLabel}`
        : `${bookings} booking${bookings === 1 ? '' : 's'} today`
    }
    if (reservationsFooter?.type === 'next' && reservationsFooter.time) {
      reservationsSummaryLine = `${reservationsSummaryLine} · Next ${reservationsFooter.time}`
    }
  }

  let tasksSummary = tasksConnected ? 'No open tasks today' : 'Tasks not connected'
  if (tasksConnected && !tasksOverview.showEmptyToday) {
    const active = Number(tasksOverview.active) || 0
    const overdue = Number(tasksOverview.overdue) || 0
    const completedToday = Number(tasksOverview.completedToday) || 0

    if (active > 0) {
      tasksSummary = active === 1 ? '1 open task' : `${active} open tasks`
      if (overdue > 0) {
        tasksSummary = `${tasksSummary} · ${overdue} overdue`
      }
      if (completedToday > 0) {
        tasksSummary = `${tasksSummary} · ${completedToday} done today`
      }
    } else if (overdue > 0) {
      tasksSummary = `${overdue} overdue task${overdue === 1 ? '' : 's'}`
    } else if (completedToday > 0) {
      tasksSummary = `${completedToday} completed today`
    }
  }

  let stockSummaryLine = ''
  if (stockConnected) {
    const outCount = Number(stockSummary?.outOfStock) || 0
    const lowCount = Number(stockSummary?.lowStock) || 0
    const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
      + (Number(stockOrdersSummary?.partialCount) || 0)

    if (hasStockModuleData || pendingDeliveries > 0) {
      if (outCount > 0 && lowCount > 0) {
        stockSummaryLine = `${outCount} out · ${lowCount} low`
      } else if (outCount > 0) {
        stockSummaryLine = outCount === 1 ? '1 item out' : `${outCount} items out`
      } else if (lowCount > 0) {
        stockSummaryLine = lowCount === 1 ? '1 item low' : `${lowCount} items low`
      } else if (pendingDeliveries > 0) {
        stockSummaryLine = pendingDeliveries === 1
          ? '1 delivery pending'
          : `${pendingDeliveries} deliveries pending`
      } else {
        stockSummaryLine = 'Stock levels OK'
      }
    } else {
      stockSummaryLine = 'Stock levels OK'
    }
  }

  return {
    onShiftSummary,
    teamScheduledSummary,
    reservationsSummaryLine,
    tasksSummary,
    stockSummaryLine,
  }
}

export function buildReservationAttentionItems({
  reservations = [],
  reservationsConnected = false,
  nowMinutes = 0,
  todayKey = getCurrentDateKey(),
  now = new Date(),
  serviceSnapshot = null,
} = {}) {
  if (!reservationsConnected) return []

  const snapshot = serviceSnapshot ?? {
    waitingLateCount: 0,
    lateCount: 0,
    waitingCount: 0,
  }
  const items = []

  if (snapshot.waitingLateCount > 0) {
    items.push({
      key: 'reservation:service-pressure',
      category: 'reservation',
      tone: snapshot.lateCount > 0 ? 'critical' : 'warning',
      priority: 'urgent',
      label: snapshot.waitingLateCount === 1
        ? '1 guest needs attention'
        : `${snapshot.waitingLateCount} guests need attention`,
      detail: snapshot.lateCount > 0
        ? `${snapshot.lateCount} late · ${snapshot.waitingCount} waiting`
        : `${snapshot.waitingCount} waiting in lobby`,
    })
  }

  const alerts = buildHostReservationAlerts(reservations, nowMinutes, todayKey, now)
  const filteredAlerts = snapshot.waitingLateCount > 0
    ? alerts.filter((alert) => (
      alert.type !== HOST_ALERT_TYPES.LATE
      && alert.type !== HOST_ALERT_TYPES.WAITING_LONG
    ))
    : alerts

  filteredAlerts.slice(0, RESERVATION_ALERT_LIMIT).forEach((alert) => {
    items.push({
      key: `reservation:${alert.id}`,
      category: 'reservation',
      tone: alert.type === HOST_ALERT_TYPES.LATE ? 'critical' : 'warning',
      priority: alert.type === HOST_ALERT_TYPES.LATE ? 'urgent' : 'reminder',
      label: alert.label,
      detail: 'Reservation service',
      reservationId: alert.reservationId ?? alert.reservation?.id ?? null,
    })
  })

  return items
}

export function buildAnnouncementAttentionItems({
  announcements = [],
  role = '',
  employeeDepartment = '',
  now = new Date(),
} = {}) {
  return filterAnnouncementsForUser(announcements, {
    role,
    employeeDepartment,
    unreadOnly: true,
    now,
  })
    .filter((announcement) => {
      const priority = normalizeAnnouncementPriority(announcement.priority)
      return priority === 'important' || priority === 'urgent'
    })
    .slice(0, ANNOUNCEMENT_ATTENTION_LIMIT)
    .map((announcement) => {
      const priority = normalizeAnnouncementPriority(announcement.priority)
      return {
        key: `announcement:${announcement.id}`,
        category: 'announcement',
        tone: priority === 'urgent' ? 'warning' : 'info',
        priority: priority === 'urgent' ? 'urgent' : 'reminder',
        label: `${announcement.title ?? 'Announcement'}`.trim() || 'Announcement',
        detail: priority === 'urgent' ? 'Urgent announcement' : 'Unread announcement',
      }
    })
}

export function buildTodayAttentionItems({
  stockAlerts = [],
  inventoryConnected = false,
  hasStockModuleData = false,
  tasks = [],
  todayKey = getCurrentDateKey(),
  issuesSummary = {},
  snapshot = {},
  coverageBreakdown = null,
} = {}) {
  const items = []
  let dueTodayCount = 0
  const showStockAlerts = hasStockModuleData || inventoryConnected

  if (showStockAlerts) {
    stockAlerts.forEach((item) => {
      items.push({
        key: `stock:${item.id}`,
        category: 'stock',
        tone: item.severity === 'critical' ? 'critical' : 'warning',
        priority: item.severity === 'critical' ? 'urgent' : 'reminder',
        label: item.name,
        detail: item.severity === 'critical' ? 'Out of stock' : 'Low stock',
      })
    })
  }

  ;(tasks ?? []).forEach((task) => {
    if (normalizeTaskStatus(task?.status) !== 'active') return

    const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
    const title = `${task?.title ?? task?.name ?? 'Task'}`.trim() || 'Task'

    if (isTaskOverdue(task, todayKey)) {
      items.push({
        key: `task:${task.id}`,
        category: 'task',
        tone: 'warning',
        priority: 'urgent',
        label: title,
        detail: 'Overdue task',
      })
      return
    }

    if (dueDate === todayKey && dueTodayCount < DUE_TODAY_TASK_LIMIT) {
      dueTodayCount += 1
      items.push({
        key: `task-due:${task.id}`,
        category: 'task',
        tone: 'info',
        priority: 'reminder',
        label: title,
        detail: 'Due today',
      })
    }
  })

  const overdueTaskItems = items.filter((item) => item.key.startsWith('task:'))
  if (overdueTaskItems.length > 5) {
    const keep = new Set(overdueTaskItems.slice(0, 5).map((item) => item.key))
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      if (item.key.startsWith('task:') && !keep.has(item.key)) {
        items.splice(index, 1)
      }
    }
  }

  const issueCount = Number(issuesSummary.count ?? snapshot.issues) || 0
  if (issueCount > 0) {
    const scheduleDetail = buildScheduleAttentionDetail(snapshot, coverageBreakdown)
      || issuesSummary.message
      || 'Review today\'s schedule'

    items.push({
      key: 'schedule-issues',
      category: 'schedule',
      tone: issueCount >= 3 ? 'critical' : 'warning',
      priority: issueCount >= 3 ? 'urgent' : 'reminder',
      label: issueCount === 1 ? 'Schedule issue' : `${issueCount} schedule issues`,
      detail: scheduleDetail,
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
  // Actionable tasks only. Team updates and meetings belong in announcements.
  const events = [...(timelineEvents ?? [])]

  if (tasksConnected) {
    ;(tasks ?? []).forEach((task) => {
      if (normalizeTaskStatus(task?.status) !== 'active') return

      const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
      if (!dueDate || dueDate > todayKey) return

      const dueTime = normalizeTimeValue(task?.dueTime ?? task?.due_time)
      const title = `${task?.title ?? task?.name ?? 'Task'}`.trim() || 'Task'
      const isOverdue = isTaskOverdue(task, todayKey)
      const department = `${task?.department ?? 'Task'}`.trim() || 'Task'

      events.push({
        key: `task:${task.id}`,
        time: dueTime || '23:59',
        timeLabel: dueTime ? formatTime24(dueTime) : 'Today',
        title,
        note: isOverdue ? 'Overdue task' : department,
        isOverdue,
        taskStatus: isOverdue ? 'overdue' : 'pending',
        type: 'task',
      })
    })
  }

  return events.sort((left, right) => (
    (parseTimeToMinutes(left.time) ?? 0) - (parseTimeToMinutes(right.time) ?? 0)
  ))
}
