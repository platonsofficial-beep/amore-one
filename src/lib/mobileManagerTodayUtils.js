export function buildManagerMobileAttentionItems({
  attentionItems = [],
  stockOrdersSummary = null,
  stockSummary = null,
  hasStockModuleData = false,
} = {}) {
  const items = [...attentionItems]
  const existingKeys = new Set(items.map((item) => item.key))

  const awaiting = Number(stockOrdersSummary?.awaitingDeliveryCount) || 0
  const partial = Number(stockOrdersSummary?.partialCount) || 0
  const drafts = Number(stockOrdersSummary?.draftCount) || 0

  if (awaiting > 0 && !existingKeys.has('orders:awaiting')) {
    items.unshift({
      key: 'orders:awaiting',
      tone: 'info',
      priority: 'urgent',
      label: awaiting === 1 ? '1 delivery to receive' : `${awaiting} deliveries to receive`,
      detail: 'Sent supplier orders waiting',
    })
  }

  if (partial > 0 && !existingKeys.has('orders:partial')) {
    items.unshift({
      key: 'orders:partial',
      tone: 'info',
      priority: 'urgent',
      label: partial === 1 ? '1 partial order open' : `${partial} partial orders open`,
      detail: 'Continue receiving stock',
    })
  }

  if (drafts > 0 && !existingKeys.has('orders:draft')) {
    items.push({
      key: 'orders:draft',
      tone: 'warning',
      priority: 'reminder',
      label: drafts === 1 ? '1 draft order' : `${drafts} draft orders`,
      detail: 'Review before sending to supplier',
    })
  }

  if (hasStockModuleData && stockSummary) {
    const outCount = Number(stockSummary.outOfStock) || 0
    const lowCount = Number(stockSummary.lowStock) || 0
    const hasStockAttention = items.some((item) => item.key.startsWith('stock:'))

    if (outCount > 0 && !hasStockAttention && !existingKeys.has('stock-module:out')) {
      items.unshift({
        key: 'stock-module:out',
        tone: 'critical',
        priority: 'urgent',
        label: outCount === 1 ? '1 item out of stock' : `${outCount} items out of stock`,
        detail: 'Check stock levels',
      })
    } else if (lowCount > 0 && !hasStockAttention && !existingKeys.has('stock-module:low')) {
      items.unshift({
        key: 'stock-module:low',
        tone: 'warning',
        priority: 'reminder',
        label: lowCount === 1 ? '1 low stock item' : `${lowCount} low stock items`,
        detail: 'Check stock levels',
      })
    }
  }

  return items
}

const MANAGER_ATTENTION_TONE_RANK = {
  critical: 0,
  warning: 1,
  info: 2,
  default: 3,
}

const MANAGER_ATTENTION_PRIORITY_RANK = {
  urgent: 0,
  reminder: 1,
}

function getManagerAttentionFeedBucket(item) {
  const key = `${item?.key ?? ''}`

  if (key === 'schedule-issues' || key.startsWith('schedule')) {
    return 0
  }

  if (key.startsWith('task:')) {
    return 1
  }

  if (
    key.startsWith('stock:')
    || key.startsWith('stock-module:')
    || key.startsWith('orders:')
  ) {
    return 2
  }

  return 3
}

export function sortManagerMobileAttentionFeed(items = []) {
  return [...items].sort((left, right) => {
    const bucketDiff = getManagerAttentionFeedBucket(left) - getManagerAttentionFeedBucket(right)
    if (bucketDiff !== 0) return bucketDiff

    const toneDiff = (
      (MANAGER_ATTENTION_TONE_RANK[left.tone] ?? 3)
      - (MANAGER_ATTENTION_TONE_RANK[right.tone] ?? 3)
    )
    if (toneDiff !== 0) return toneDiff

    const priorityDiff = (
      (MANAGER_ATTENTION_PRIORITY_RANK[left.priority] ?? 2)
      - (MANAGER_ATTENTION_PRIORITY_RANK[right.priority] ?? 2)
    )
    if (priorityDiff !== 0) return priorityDiff

    return 0
  })
}

export function buildManagerMobileStockStatusLine(stockSummary = null, stockOrdersSummary = null) {
  const outCount = Number(stockSummary?.outOfStock) || 0
  const lowCount = Number(stockSummary?.lowStock) || 0
  const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
    + (Number(stockOrdersSummary?.partialCount) || 0)

  if (outCount > 0 && lowCount > 0) {
    return `${outCount} out · ${lowCount} low`
  }

  if (outCount > 0) {
    return outCount === 1 ? '1 item out' : `${outCount} items out`
  }

  if (lowCount > 0) {
    return lowCount === 1 ? '1 item low' : `${lowCount} items low`
  }

  if (pendingDeliveries > 0) {
    return pendingDeliveries === 1 ? '1 delivery pending' : `${pendingDeliveries} deliveries pending`
  }

  return 'Stock levels OK'
}

function normalizeManagerTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function isManagerMobileTaskDone(task) {
  const status = `${task?.status ?? ''}`.trim().toLowerCase()
  return status === 'completed' || status === 'skipped'
}

function sortManagerMobileTasks(left, right) {
  const leftDate = normalizeManagerTaskDateKey(left?.dueDate ?? left?.due_date) || '9999-12-31'
  const rightDate = normalizeManagerTaskDateKey(right?.dueDate ?? right?.due_date) || '9999-12-31'
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
  return `${left?.title ?? ''}`.localeCompare(`${right?.title ?? ''}`)
}

function isManagerMobileTaskCompletedToday(task, todayKey) {
  if (!isManagerMobileTaskDone(task)) return false
  const completedAt = task?.completedAt ?? task?.completed_at ?? null
  if (!completedAt) return false

  const parsed = new Date(completedAt)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear()
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
    const day = `${parsed.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}` === todayKey
  }

  return normalizeManagerTaskDateKey(completedAt) === todayKey
}

function isManagerMobileTaskInTodayWorkload(task, todayKey) {
  const dueDate = normalizeManagerTaskDateKey(task?.dueDate ?? task?.due_date)

  if (isManagerMobileTaskDone(task)) {
    return isManagerMobileTaskCompletedToday(task, todayKey)
  }

  return Boolean(dueDate) && dueDate <= todayKey
}

function compareManagerTaskDueTime(left, right) {
  const leftTime = `${left?.dueTime ?? left?.due_time ?? ''}`.trim()
  const rightTime = `${right?.dueTime ?? right?.due_time ?? ''}`.trim()
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
  return sortManagerMobileTasks(left, right)
}

export function buildManagerMobileTodayTaskList(tasks = [], todayKey = '') {
  const todayTasks = (tasks ?? []).filter((task) => isManagerMobileTaskInTodayWorkload(task, todayKey))
  const active = []
  const completed = []

  todayTasks.forEach((task) => {
    if (isManagerMobileTaskDone(task)) {
      completed.push(task)
    } else {
      active.push(task)
    }
  })

  active.sort((left, right) => {
    const leftDate = normalizeManagerTaskDateKey(left?.dueDate ?? left?.due_date)
    const rightDate = normalizeManagerTaskDateKey(right?.dueDate ?? right?.due_date)
    const leftOverdue = leftDate && leftDate < todayKey ? 0 : 1
    const rightOverdue = rightDate && rightDate < todayKey ? 0 : 1
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue
    return compareManagerTaskDueTime(left, right)
  })

  completed.sort((left, right) => {
    const leftAt = `${left?.completedAt ?? left?.completed_at ?? ''}`
    const rightAt = `${right?.completedAt ?? right?.completed_at ?? ''}`
    return rightAt.localeCompare(leftAt)
  })

  return [...active, ...completed]
}

export function pickManagerMobileAttentionTasks(tasks = [], todayKey = '', limit = 3) {
  const activeTasks = (tasks ?? []).filter((task) => !isManagerMobileTaskDone(task))
  const overdue = []
  const dueSoon = []

  activeTasks.forEach((task) => {
    const dueDate = normalizeManagerTaskDateKey(task?.dueDate ?? task?.due_date)
    if (dueDate && dueDate < todayKey) {
      overdue.push({ task, attentionKind: 'overdue' })
      return
    }

    if (!dueDate || dueDate <= todayKey) {
      dueSoon.push({
        task,
        attentionKind: dueDate === todayKey ? 'due-soon' : 'open',
      })
    }
  })

  overdue.sort((left, right) => sortManagerMobileTasks(left.task, right.task))
  dueSoon.sort((left, right) => compareManagerTaskDueTime(left.task, right.task))

  return [...overdue, ...dueSoon].slice(0, limit)
}

export function buildManagerMobileTeamProgress(tasks = [], employees = [], todayKey = '') {
  const buckets = new Map()

  ;(tasks ?? []).forEach((task) => {
    if (!isManagerMobileTaskInTodayWorkload(task, todayKey)) return

    const employeeId = `${task?.assignedTo ?? task?.assigned_to ?? ''}`.trim()
    if (!employeeId) return

    const bucket = buckets.get(employeeId) ?? { employeeId, done: 0, total: 0 }
    bucket.total += 1
    if (isManagerMobileTaskDone(task)) {
      bucket.done += 1
    }
    buckets.set(employeeId, bucket)
  })

  return Array.from(buckets.values())
    .map((entry) => ({
      employeeId: entry.employeeId,
      name: `${employees.find((employee) => `${employee.id}` === entry.employeeId)?.name ?? ''}`.trim()
        || 'Team member',
      done: entry.done,
      total: entry.total,
    }))
    .sort((left, right) => {
      const leftRate = left.total > 0 ? left.done / left.total : 1
      const rightRate = right.total > 0 ? right.done / right.total : 1
      if (leftRate !== rightRate) return leftRate - rightRate
      return left.name.localeCompare(right.name)
    })
}

export function pickManagerMobileTaskPreviewLists(tasks = [], todayKey = '', limit = 8) {
  const activeTasks = (tasks ?? []).filter((task) => !isManagerMobileTaskDone(task))
  const overdue = []
  const openToday = []

  activeTasks.forEach((task) => {
    const dueDate = normalizeManagerTaskDateKey(task?.dueDate ?? task?.due_date)
    if (dueDate && dueDate < todayKey) {
      overdue.push(task)
      return
    }

    if (!dueDate || dueDate <= todayKey) {
      openToday.push(task)
    }
  })

  overdue.sort(sortManagerMobileTasks)
  openToday.sort(sortManagerMobileTasks)

  return {
    overdue: overdue.slice(0, limit),
    openToday: openToday.slice(0, limit),
  }
}
