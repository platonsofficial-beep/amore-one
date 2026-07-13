import { isOperationsTaskOverdue } from './operationsBrowse'
import { normalizeOperationsStatus, normalizeOperationsTaskDate } from './operationsUtils'

export const TODAY_ATTENTION_DESTINATION_VIEWS = new Set([
  'today',
  'stock',
  'operations',
  'team',
  'reservations',
])

const DUE_TODAY_OPERATIONS_TASK_LIMIT = 3

function extractAttentionKeyId(key, prefix) {
  const raw = `${key ?? ''}`.slice(prefix.length).trim()
  return raw || null
}

export function resolveTodayAttentionDestination(item, permissions = {}) {
  const key = `${item?.key ?? ''}`

  if (key.startsWith('stock:') || key.startsWith('stock-module:')) {
    if (!permissions.canViewStock) return null
    return { view: 'stock', section: 'dashboard' }
  }

  if (key === 'orders:awaiting' || key === 'orders:partial') {
    if (!permissions.canViewStock) return null
    return { view: 'stock', section: 'orders', action: 'receive-deliveries' }
  }

  if (key === 'orders:draft') {
    if (!permissions.canViewStock) return null
    return { view: 'stock', section: 'orders' }
  }

  if (key.startsWith('task:') || key.startsWith('task-due:')) {
    if (!permissions.canViewTasks) return null
    const taskId = extractAttentionKeyId(
      key,
      key.startsWith('task-due:') ? 'task-due:' : 'task:',
    )
    return { view: 'operations', section: 'dashboard', taskId }
  }

  if (key === 'schedule-issues') {
    if (!permissions.canViewSchedule) return null
    return { view: 'team', section: 'schedule' }
  }

  if (key.startsWith('reservation:')) {
    if (!permissions.canViewReservations) return null
    const reservationId = item?.reservationId ?? null
    if (reservationId) {
      return {
        view: 'reservations',
        action: 'host',
        reservationId,
      }
    }
    return { view: 'reservations' }
  }

  if (key.startsWith('announcement:')) {
    const announcementId = extractAttentionKeyId(key, 'announcement:')
    return {
      view: 'today',
      action: 'announcements',
      announcementId,
    }
  }

  return null
}

export function isTodayAttentionItemActionable(item, permissions = {}) {
  return resolveTodayAttentionDestination(item, permissions) !== null
}

function formatDestinationAction(destination) {
  if (!destination) return 'Open'

  if (destination.view === 'stock') {
    if (destination.action === 'receive-deliveries') return 'Receive deliveries'
    if (destination.section === 'orders') return 'Open stock orders'
    return 'Open stock'
  }

  if (destination.view === 'operations' && destination.section === 'dashboard' && destination.taskId) {
    return 'Open task'
  }

  if (destination.view === 'team' && destination.section === 'schedule') {
    return 'Open schedule'
  }

  if (destination.view === 'reservations') {
    return destination.action === 'host' ? 'Open reservation in host view' : 'Open reservations'
  }

  if (destination.view === 'today' && destination.action === 'announcements') {
    return 'View announcement'
  }

  return 'Open'
}

export function formatTodayAttentionActionLabel(item, destination = null) {
  const label = `${item?.label ?? 'Attention item'}`.trim() || 'Attention item'
  const detail = `${item?.detail ?? ''}`.trim()
  const action = formatDestinationAction(destination)

  return detail ? `${action}: ${label}. ${detail}` : `${action}: ${label}`
}

export function buildOperationsTaskAttentionItems(tasks = [], todayKey = '') {
  const items = []
  let dueTodayCount = 0

  ;(tasks ?? []).forEach((task) => {
    if (normalizeOperationsStatus(task?.status) !== 'pending') return

    const dueDate = normalizeOperationsTaskDate(task?.dueDate ?? task?.due_date)
    const title = `${task?.title ?? ''}`.trim() || 'Task'

    if (isOperationsTaskOverdue(task, todayKey)) {
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

    if (dueDate === todayKey && dueTodayCount < DUE_TODAY_OPERATIONS_TASK_LIMIT) {
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

  return items
}

export function getTodayAttentionItemA11y(item, permissions = {}) {
  const destination = resolveTodayAttentionDestination(item, permissions)
  const isActionable = destination !== null

  return {
    destination,
    isActionable,
    actionLabel: isActionable ? formatTodayAttentionActionLabel(item, destination) : '',
  }
}
