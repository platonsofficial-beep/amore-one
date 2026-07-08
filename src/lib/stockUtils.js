import { computeSuggestedOrder, itemNeedsOrder } from './stockCatalog'
import { getCurrentDateKey } from './currentDateUtils'
import { formatTimestampTime24 } from './timeFormatUtils'

export const STOCK_MOVEMENT_TYPES = ['receive', 'usage', 'adjustment', 'stock_count']

export function resolveStockItemStatus(item) {
  if (!item?.active) return 'inactive'
  const quantity = Number(item.currentQuantity ?? item.current_quantity ?? 0)
  const minimum = Number(item.minimumQuantity ?? item.minimum_quantity ?? 0)

  if (quantity <= 0) return 'out'
  if (quantity < minimum) return 'low'
  return 'ok'
}

export function getStockStatusLabel(status) {
  if (status === 'out') return 'Out of stock'
  if (status === 'low') return 'Low stock'
  if (status === 'inactive') return 'Inactive'
  return 'In stock'
}

export function getStockStatusShortLabel(status) {
  if (status === 'out') return 'Out'
  if (status === 'low') return 'Low'
  if (status === 'inactive') return 'Inactive'
  return 'OK'
}

function normalizeStockAlertDateKey(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isStockMovementOnDate(movement, dateKey) {
  const normalizedDateKey = `${dateKey ?? ''}`.trim()
  if (!normalizedDateKey || !movement?.createdAt) return false
  return normalizeStockAlertDateKey(movement.createdAt) === normalizedDateKey
}

export function getStockModuleAlertItems(stockItems = [], limit = 5) {
  return (stockItems ?? [])
    .filter((item) => item.active !== false)
    .map((item) => ({
      item,
      status: resolveStockItemStatus(item),
    }))
    .filter(({ status }) => status === 'out' || status === 'low')
    .sort((left, right) => {
      if (left.status === right.status) {
        return `${left.item.name ?? ''}`.localeCompare(`${right.item.name ?? ''}`)
      }
      return left.status === 'out' ? -1 : 1
    })
    .slice(0, limit)
    .map(({ item, status }) => ({
      id: String(item.id),
      name: `${item.name ?? ''}`.trim() || 'Item',
      status: status === 'out' ? 'Out of Stock' : 'Low Stock',
      severity: status === 'out' ? 'critical' : 'low',
      quantity: item.currentQuantity,
      unit: item.unit,
    }))
}

export function resolveDashboardStockAlerts(stockItems = [], inventoryAlerts = []) {
  if (stockItems.length > 0) {
    const stockAlerts = getStockModuleAlertItems(stockItems)
    if (stockAlerts.length > 0) return stockAlerts
  }

  return inventoryAlerts
}

export function buildTodayStockActivitySummary(stockItems = [], todayKey = getCurrentDateKey()) {
  const normalizedTodayKey = `${todayKey ?? ''}`.trim() || getCurrentDateKey()
  let received = 0
  let usage = 0
  let adjustments = 0
  let counts = 0
  const touchedItemIds = new Set()

  ;(stockItems ?? []).forEach((item) => {
    if (item.active === false) return

    const movement = item.lastMovement
    if (!movement || !isStockMovementOnDate(movement, normalizedTodayKey)) return

    touchedItemIds.add(item.id)
    const quantity = Math.abs(Number(movement.quantity) || 0)

    if (movement.type === 'receive') {
      received += quantity
      return
    }

    if (movement.type === 'usage') {
      usage += quantity
      return
    }

    if (movement.type === 'adjustment') {
      adjustments += 1
      return
    }

    if (movement.type === 'stock_count') {
      counts += 1
    }
  })

  return {
    itemsTouched: touchedItemIds.size,
    received,
    usage,
    adjustments,
    counts,
    hasActivity: touchedItemIds.size > 0,
  }
}

export function formatTodayStockActivityLine(summary) {
  if (!summary?.hasActivity) {
    return 'No stock updates today'
  }

  const parts = []

  if (summary.counts > 0) {
    parts.push(`${summary.counts} count${summary.counts === 1 ? '' : 's'}`)
  }

  if (summary.received > 0) {
    parts.push(`${summary.received} received`)
  }

  if (summary.usage > 0) {
    parts.push(`${summary.usage} used`)
  }

  if (summary.adjustments > 0) {
    parts.push(`${summary.adjustments} adjustment${summary.adjustments === 1 ? '' : 's'}`)
  }

  if (parts.length === 0) {
    const count = Number(summary.itemsTouched) || 0
    return count === 1 ? '1 item updated today' : `${count} items updated today`
  }

  return parts.join(' · ')
}

export function buildStockManagerDailySnapshot(
  stockItems = [],
  ordersSummary = {},
  todayKey = getCurrentDateKey(),
) {
  const summary = buildStockDashboardSummary(stockItems)
  const activity = buildTodayStockActivitySummary(stockItems, todayKey)

  return {
    ...summary,
    pendingDeliveries: (Number(ordersSummary.awaitingDeliveryCount) || 0)
      + (Number(ordersSummary.partialCount) || 0),
    draftOrders: Number(ordersSummary.draftCount) || 0,
    pendingOrders: Number(ordersSummary.pendingCount) || 0,
    activityLine: formatTodayStockActivityLine(activity),
    activity,
  }
}

export function buildStockDashboardSummary(items = []) {
  const activeItems = (items ?? []).filter((item) => item.active !== false)

  const totalItems = activeItems.length
  const lowStock = activeItems.filter((item) => resolveStockItemStatus(item) === 'low').length
  const outOfStock = activeItems.filter((item) => resolveStockItemStatus(item) === 'out').length
  const totalValue = activeItems.reduce((sum, item) => {
    const quantity = Number(item.currentQuantity) || 0
    const cost = Number(item.costPrice) || 0
    return sum + (quantity * cost)
  }, 0)

  const toOrder = activeItems.filter((item) => itemNeedsOrder(item)).length

  return {
    totalItems,
    lowStock,
    outOfStock,
    toOrder,
    totalValue,
  }
}

export function getStockCategoryFilters(items = []) {
  const categories = new Set()

  ;(items ?? []).forEach((item) => {
    const category = `${item.category ?? ''}`.trim()
    if (category) categories.add(category)
  })

  return ['All', ...Array.from(categories).sort((a, b) => a.localeCompare(b))]
}

export function formatStockCurrency(value) {
  const amount = Number(value) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatStockPurchasePrice(value) {
  const amount = Number(value) || 0
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatStockInventoryValue(value) {
  return formatStockPurchasePrice(value)
}

export function formatStockQuantity(value, unit = '') {
  const quantity = Number(value)
  const formatted = Number.isFinite(quantity)
    ? (Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, ''))
    : '0'
  const normalizedUnit = `${unit ?? ''}`.trim()
  return normalizedUnit ? `${formatted} ${normalizedUnit}` : formatted
}

export function applyStockMovementQuantity(currentQuantity, type, quantity) {
  const current = Number(currentQuantity) || 0
  const delta = Number(quantity) || 0

  if (type === 'receive') {
    return Math.max(0, current + Math.abs(delta))
  }

  if (type === 'usage') {
    return Math.max(0, current - Math.abs(delta))
  }

  if (type === 'adjustment') {
    return Math.max(0, current + delta)
  }

  if (type === 'stock_count') {
    return Math.max(0, Math.abs(delta))
  }

  return current
}

export function getStockMovementLabel(type) {
  if (type === 'receive') return 'Receive'
  if (type === 'usage') return 'Usage'
  if (type === 'adjustment') return 'Adjustment'
  if (type === 'stock_count') return 'Stock count'
  return 'Update'
}

export function formatStockMovementRelativeTime(value, now = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const time = formatTimestampTime24(date, '')

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000)

  if (dayDiff === 0) return `Today ${time}`
  if (dayDiff === 1) return `Yesterday ${time}`

  const dayLabel = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date)

  return `${dayLabel} ${time}`
}

export function formatStockMovementTimestamp(value) {
  return formatStockMovementRelativeTime(value)
}

export function formatStockLastMovementLine(movement) {
  if (!movement?.type) return ''
  const label = getStockMovementLabel(movement.type)
  const when = formatStockMovementRelativeTime(movement.createdAt)
  return when ? `${label} • ${when}` : label
}

export { computeSuggestedOrder }
