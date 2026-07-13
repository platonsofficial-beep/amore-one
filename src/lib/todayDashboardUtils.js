import { formatTime24, formatTimeRange24, normalizeTimeValue } from './timeFormatUtils'
import { parseTimeToMinutes } from './shiftHoursUtils'

export const TIMELINE_PREVIEW_LIMIT = 10
export const TIMELINE_SCROLL_LIMIT = 10

const TIMELINE_GROUP_ORDER = [
  { type: 'shift', label: 'Team' },
  { type: 'reservation', label: 'Reservations' },
  { type: 'task', label: 'Tasks' },
]

function formatPluralCount(count, singular, plural = `${singular}s`) {
  if (!count) return ''
  return `${count} ${count === 1 ? singular : plural}`
}

function formatTeamTodayCoverageCopy(label = '') {
  const text = `${label ?? ''}`.trim()
  if (!text) return text

  return text
    .replace(/\b(\d+)\s+coverage gaps\b/gi, '$1 Open shifts')
    .replace(/\b1\s+coverage gap\b/gi, '1 Open shift')
    .replace(/\b(\d+)\s+gaps\b/gi, '$1 Open shifts')
    .replace(/\b1\s+gap\b/gi, '1 Open shift')
}

function isTimeWithinShift(nowMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return false
  if (startMinutes === endMinutes) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

function isShiftActiveNow(event, nowMinutes) {
  const startMinutes = parseTimeToMinutes(normalizeTimeValue(event?.time ?? event?.startTime))
  const endMinutes = parseTimeToMinutes(normalizeTimeValue(event?.endTime))
  return isTimeWithinShift(nowMinutes, startMinutes, endMinutes)
}

function isShiftFinished(event, nowMinutes) {
  const startMinutes = parseTimeToMinutes(normalizeTimeValue(event?.time ?? event?.startTime))
  const endMinutes = parseTimeToMinutes(normalizeTimeValue(event?.endTime))
  if (startMinutes === null || endMinutes === null) return false
  if (isShiftActiveNow(event, nowMinutes)) return false

  if (endMinutes > startMinutes) {
    return nowMinutes >= endMinutes
  }

  return nowMinutes >= endMinutes && nowMinutes < startMinutes
}

function getShiftTimelineState(event, nowMinutes) {
  if (!Number.isFinite(nowMinutes)) return 'upcoming'
  if (isShiftActiveNow(event, nowMinutes)) return 'working'

  const startMinutes = parseTimeToMinutes(normalizeTimeValue(event?.time ?? event?.startTime))
  if (startMinutes !== null && startMinutes > nowMinutes) return 'upcoming'
  if (isShiftFinished(event, nowMinutes)) return 'finished'
  return 'upcoming'
}

export function getTimelineEventStatus(event, nowMinutes = null) {
  if (event?.type === 'shift') {
    const state = getShiftTimelineState(event, nowMinutes)
    if (state === 'working') {
      return { icon: '🟢', state: 'working', tone: 'live' }
    }
    if (state === 'finished') {
      return { icon: '⚫', state: 'finished', tone: 'completed' }
    }
    return { icon: '🟡', state: 'upcoming', tone: 'upcoming' }
  }

  if (event?.type === 'reservation') {
    const isUpcoming = Number.isFinite(nowMinutes) && getEventSortMinutes(event) > nowMinutes
    return {
      icon: isUpcoming ? '🟡' : '⚫',
      state: isUpcoming ? 'upcoming' : 'completed',
      tone: isUpcoming ? 'upcoming' : 'completed',
    }
  }

  if (event?.type === 'task') {
    if (event?.taskStatus === 'completed' || event?.isCompleted) {
      return { icon: '⚫', state: 'completed', tone: 'completed' }
    }
    if (event?.isOverdue || event?.taskStatus === 'overdue') {
      return { icon: '🔴', state: 'overdue', tone: 'attention' }
    }
    return { icon: '🟡', state: 'pending', tone: 'upcoming' }
  }

  return { icon: '🟡', state: 'neutral', tone: 'upcoming' }
}

export function isTimelineEventActiveNow(event, nowMinutes) {
  if (event?.type === 'shift') {
    return getShiftTimelineState(event, nowMinutes) === 'working'
  }
  if (event?.type === 'task') {
    return Boolean(event?.isOverdue || event?.taskStatus === 'overdue')
  }
  return false
}

export function isTimelineEventCompleted(event, nowMinutes) {
  if (event?.type === 'shift') {
    return getShiftTimelineState(event, nowMinutes) === 'finished'
  }
  if (event?.type === 'reservation') {
    return Number.isFinite(nowMinutes) && getEventSortMinutes(event) <= nowMinutes
  }
  if (event?.type === 'task') {
    return Boolean(event?.taskStatus === 'completed' || event?.isCompleted)
  }
  return false
}

export function formatTimelineEventRow(event, nowMinutes = null) {
  const status = getTimelineEventStatus(event, nowMinutes)

  if (event?.type === 'shift') {
    const role = `${event.role ?? event.note ?? ''}`.trim()
    const area = `${event.area ?? ''}`.trim()
    const detail = role || area
    const startTime = normalizeTimeValue(event?.time ?? event?.startTime)
    const endTime = normalizeTimeValue(event?.endTime)
    const endLabel = event.endTimeLabel || formatTime24(endTime)
    const rangeLabel = formatTimeRange24(startTime, endTime, ' - ')

    if (status.state === 'finished') {
      return {
        key: event.key,
        type: event.type,
        timeLabel: '',
        title: event.title,
        meta: rangeLabel ? `Completed shift · ${rangeLabel}` : 'Completed shift',
        status,
        isFinishedShift: true,
        isCompletedItem: true,
        isCompactRow: true,
      }
    }

    if (status.state === 'working') {
      return {
        key: event.key,
        type: event.type,
        timeLabel: event.timeLabel,
        title: event.title,
        detail,
        meta: endLabel ? `Working · until ${endLabel}` : 'Working',
        status,
        isFinishedShift: false,
        isCompletedItem: false,
        isCompactRow: false,
      }
    }

    return {
      key: event.key,
      type: event.type,
      timeLabel: event.timeLabel,
      title: event.title,
      detail,
      meta: endLabel ? `until ${endLabel}` : '',
      status,
      isFinishedShift: false,
      isCompletedItem: false,
      isCompactRow: false,
    }
  }

  if (event?.type === 'reservation') {
    const guestName = `${event.guestName ?? event.title ?? 'Guest'}`.replace(/ reservation$/i, '').trim() || 'Guest'
    const guests = Number(event.guests)
    const guestsLabel = Number.isFinite(guests) && guests > 0 ? `${guests} guests` : ''
    const tableNumber = `${event.tableNumber ?? ''}`.trim()
    const tableLabel = tableNumber ? `Table ${tableNumber}` : ''
    const subtitle = [guestsLabel, tableLabel].filter(Boolean).join(' · ') || event.note || ''
    const isCompletedItem = status.state === 'completed'

    return {
      key: event.key,
      type: event.type,
      timeLabel: isCompletedItem ? '' : event.timeLabel,
      title: guestName,
      meta: isCompletedItem ? subtitle : '',
      subtitle: isCompletedItem ? '' : subtitle,
      status,
      isCompletedItem,
      isCompactRow: isCompletedItem,
    }
  }

  if (event?.type === 'task') {
    const isCompletedItem = status.state === 'completed'
    const subtitle = isCompletedItem
      ? 'Completed'
      : event.isOverdue || event.taskStatus === 'overdue'
        ? 'Overdue'
        : `${event.note ?? 'Pending'}`.trim() || 'Pending'

    return {
      key: event.key,
      type: event.type,
      timeLabel: isCompletedItem ? '' : event.timeLabel,
      title: event.title,
      meta: isCompletedItem ? subtitle : '',
      subtitle: isCompletedItem ? '' : subtitle,
      status,
      isCompletedItem,
      isCompactRow: isCompletedItem,
    }
  }

  return {
    key: event.key,
    type: event.type,
    timeLabel: event.timeLabel,
    title: event.title,
    subtitle: event.note || '',
    status,
  }
}

export function groupTimelineEvents(events = []) {
  const groups = TIMELINE_GROUP_ORDER.map((group) => ({
    ...group,
    events: [],
  }))

  const groupByType = new Map(groups.map((group) => [group.type, group]))

  ;(events ?? []).forEach((event) => {
    const group = groupByType.get(event?.type)
    if (group) {
      group.events.push(event)
    }
  })

  return groups.filter((group) => group.events.length > 0)
}

export function formatTodayTimelineCollapsedSummary(events = [], { isLoading = false, now = new Date() } = {}) {
  if (isLoading) return 'Loading…'
  if (!events.length) return 'No events today'

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const shiftEvents = events.filter((event) => event.type === 'shift')
  const reservationEvents = events.filter((event) => event.type === 'reservation')
  const taskEvents = events.filter((event) => event.type === 'task')

  const workingCount = shiftEvents.filter((event) => isShiftActiveNow(event, nowMinutes)).length
  const staffLabel = workingCount > 0
    ? formatPluralCount(workingCount, 'staff member working', 'staff working')
    : formatPluralCount(shiftEvents.length, 'shift scheduled', 'shifts scheduled')

  let reservationLabel = ''
  const upcomingReservation = reservationEvents.find((event) => {
    const minutes = parseTimeToMinutes(normalizeTimeValue(event.time))
    return minutes === null || minutes >= nowMinutes
  }) ?? reservationEvents[0]

  if (upcomingReservation?.timeLabel) {
    reservationLabel = `Next reservation ${upcomingReservation.timeLabel}`
  }

  const pendingTasks = taskEvents.filter((event) => !event.isCompleted && event.taskStatus !== 'completed').length
  const taskLabel = pendingTasks > 0
    ? formatPluralCount(pendingTasks, 'task', 'tasks')
    : ''

  return [staffLabel, reservationLabel, taskLabel].filter(Boolean).join(' · ')
}

export function formatTeamTodayCollapsedSummary({
  groups = [],
  teamStatus = {},
  isLoading = false,
} = {}) {
  if (isLoading) return 'Loading…'

  const memberCount = groups.reduce((sum, group) => sum + group.members.length, 0)
  if (memberCount === 0) return 'No shifts scheduled today'

  const workingMatch = `${teamStatus.scheduleValue ?? ''}`.match(/(\d+)/)
  const workingCount = workingMatch ? Number(workingMatch[1]) : 0
  const workingLabel = workingCount > 0
    ? formatPluralCount(workingCount, 'working now', 'working now')
    : 'No one on shift yet'

  const coverageLabel = teamStatus.coverageTone === 'ok'
    ? 'Service covered'
    : formatTeamTodayCoverageCopy(teamStatus.coverageDetail || teamStatus.coverageValue || 'Review coverage')

  return `${workingLabel} · ${coverageLabel}`
}

export function formatAttentionCollapsedSummary(items = []) {
  if (!items.length) return 'All clear for now'

  const urgentCount = items.filter((item) => item.priority === 'urgent' || item.tone === 'critical').length
  const reminderCount = items.length - urgentCount

  const parts = []
  if (urgentCount > 0) {
    parts.push(formatPluralCount(urgentCount, 'Needs attention', 'Needs attention'))
  }
  if (reminderCount > 0) {
    parts.push(formatPluralCount(reminderCount, 'reminder', 'reminders'))
  }

  return parts.join(' · ') || 'All clear for now'
}

export function formatQuickActionsCollapsedSummary(actions = []) {
  const labels = (actions ?? [])
    .filter((action) => action.available)
    .map((action) => {
      if (action.id === 'add-reservation') return 'Create reservation'
      if (action.id === 'add-task') return 'Add task'
      return action.label
    })

  return labels.join(' · ') || 'Quick actions'
}

export function hasUrgentAttentionItems(items = []) {
  return (items ?? []).some((item) => item.priority === 'urgent' || item.tone === 'critical')
}

export const TIMELINE_LEGEND_ITEMS = [
  { key: 'live', label: 'Live', icon: '🟢', tone: 'live' },
  { key: 'upcoming', label: 'Upcoming', icon: '🟡', tone: 'upcoming' },
  { key: 'completed', label: 'Completed', icon: '⚫', tone: 'completed' },
  { key: 'attention', label: 'Needs attention', icon: '🔴', tone: 'attention' },
]

export function filterTimelineEventsForDayFlow(events = []) {
  return (events ?? []).filter((event) => {
    if (event?.type !== 'task') return true
    return `${event?.timeLabel ?? ''}`.trim().toLowerCase() !== 'today'
  })
}

function getEventSortMinutes(event) {
  const minutes = parseTimeToMinutes(normalizeTimeValue(event?.time ?? event?.startTime))
  if (minutes !== null) return minutes
  return 0
}

function compareTimelineEventsByTime(left, right) {
  const leftMinutes = getEventSortMinutes(left)
  const rightMinutes = getEventSortMinutes(right)
  if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes

  const typeOrder = { shift: 0, reservation: 1, task: 2 }
  const leftOrder = typeOrder[left?.type] ?? 9
  const rightOrder = typeOrder[right?.type] ?? 9
  if (leftOrder !== rightOrder) return leftOrder - rightOrder

  return `${left?.title ?? ''}`.localeCompare(`${right?.title ?? ''}`)
}

export function sortTimelineEventsChronologically(events = [], now = new Date()) {
  const filtered = filterTimelineEventsForDayFlow(events)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const activeNow = []
  const upcoming = []
  const completed = []

  filtered.forEach((event) => {
    if (isTimelineEventActiveNow(event, nowMinutes)) {
      activeNow.push(event)
      return
    }
    if (isTimelineEventCompleted(event, nowMinutes)) {
      completed.push(event)
      return
    }
    upcoming.push(event)
  })

  activeNow.sort(compareTimelineEventsByTime)
  upcoming.sort(compareTimelineEventsByTime)
  completed.sort(compareTimelineEventsByTime)

  return [...activeNow, ...upcoming, ...completed]
}

export function partitionTimelineEvents(events = [], now = new Date()) {
  const sorted = sortTimelineEventsChronologically(events, now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const activeAndUpcoming = sorted.filter((event) => !isTimelineEventCompleted(event, nowMinutes))
  const completed = sorted.filter((event) => isTimelineEventCompleted(event, nowMinutes))
  return { activeAndUpcoming, completed }
}

function isEventUpcoming(event, nowMinutes) {
  if (isTimelineEventActiveNow(event, nowMinutes)) return false
  if (isTimelineEventCompleted(event, nowMinutes)) return false

  if (event?.type === 'shift') {
    return getShiftTimelineState(event, nowMinutes) === 'upcoming'
  }

  if (event?.type === 'reservation') {
    return getEventSortMinutes(event) > nowMinutes
  }

  if (event?.type === 'task') {
    return getEventSortMinutes(event) > nowMinutes
  }

  return getEventSortMinutes(event) > nowMinutes
}

export function buildTimelineEventRows(events = [], {
  now = new Date(),
  showNow = false,
} = {}) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowLabel = formatTime24(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  )
  const rows = []
  let nowInserted = false

  events.forEach((event) => {
    if (showNow && !nowInserted && isEventUpcoming(event, nowMinutes)) {
      rows.push({
        kind: 'now',
        key: `timeline-now-${rows.length}`,
        label: nowLabel,
      })
      nowInserted = true
    }

    rows.push({
      kind: 'event',
      key: event.key,
      event,
    })
  })

  if (showNow && !nowInserted && events.length > 0) {
    rows.push({
      kind: 'now',
      key: 'timeline-now-end',
      label: nowLabel,
    })
  }

  return rows
}

export function buildTimelineDisplayRows(events = [], {
  now = new Date(),
  showNow = false,
} = {}) {
  const { activeAndUpcoming, completed } = partitionTimelineEvents(events, now)

  return {
    activeRows: buildTimelineEventRows(activeAndUpcoming, { now, showNow }),
    completedRows: buildTimelineEventRows(completed, { now, showNow: false }),
    completedCount: completed.length,
    activeCount: activeAndUpcoming.length,
  }
}

export function shouldShowTimelineNowMarker({ todayKey = '', currentDateKey = '' } = {}) {
  if (!todayKey || !currentDateKey) return false
  return todayKey === currentDateKey
}
