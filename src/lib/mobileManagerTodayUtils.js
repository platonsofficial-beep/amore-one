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
