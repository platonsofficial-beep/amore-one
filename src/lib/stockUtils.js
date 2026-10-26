import { computeSuggestedOrder, itemNeedsOrder, resolveStockParQuantity } from './stockCatalog'
import { isWasteNote } from './stockWaste'
import { getCurrentDateKey } from './currentDateUtils'
import { formatInventoryUnit } from './inventoryUnitDisplay'
import { calendarDayKey, formatInVenueZone, formatTimestampTime24, previousCalendarDayKey } from './timeFormatUtils'

export {
  formatInventoryQuantityNumber,
  formatInventoryUnit,
  formatInventoryUnitLabel,
} from './inventoryUnitDisplay'

export const STOCK_MOVEMENT_TYPES = ['receive', 'usage', 'adjustment', 'stock_count']

/**
 * Quantity health only (out / low / ok). Ignores active/inactive lifecycle.
 * Low is on hand at or below the catalog minimum. Target quantity is the
 * order par and does not mark an item Low. Out stays on-hand <= 0.
 */
export function resolveStockItemQuantityStatus(item) {
  const quantity = Number(item?.currentQuantity ?? item?.current_quantity ?? 0)

  if (!Number.isFinite(quantity) || quantity <= 0) return 'out'
  const minimum = Number(item?.minimumQuantity ?? item?.minimum_quantity ?? 0)
  if (Number.isFinite(minimum) && minimum > 0 && quantity <= minimum) return 'low'
  return 'ok'
}

/**
 * Usage ceiling for the movement modal.
 * A selected storage must use that location's balance. Null means the
 * location balance is unknown — do not fall back to global on-hand.
 * With no storage, the ceiling is global on-hand.
 */
export function resolveStockUsageCeiling({
  destinationStorage = null,
  balanceQuantity = null,
  currentQuantity = 0,
} = {}) {
  if (destinationStorage) {
    if (balanceQuantity == null || balanceQuantity === '') return null
    const locationBalance = Number(balanceQuantity)
    return Number.isFinite(locationBalance) ? locationBalance : null
  }
  const onHand = Number(currentQuantity)
  return Number.isFinite(onHand) ? onHand : 0
}

export function resolveStockItemStatus(item) {
  if (!item?.active) return 'inactive'
  return resolveStockItemQuantityStatus(item)
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
  // Catalog minimum (on hand > 0 and <= minimum). Not the shelf below-par count.
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

/**
 * The one stock health line. Out is on hand <= 0. Low is 0 < on hand <= catalog
 * minimum. Shelf below-par is a different number and is not folded in here.
 */
export function formatSharedStockHealthLine(summary = {}) {
  const outCount = Math.max(0, Number(summary?.outOfStock) || 0)
  const lowCount = Math.max(0, Number(summary?.lowStock) || 0)

  if (outCount > 0 && lowCount > 0) return `${outCount} out · ${lowCount} low`
  if (outCount === 1) return '1 item out'
  if (outCount > 1) return `${outCount} items out`
  if (lowCount === 1) return '1 item low'
  if (lowCount > 1) return `${lowCount} items low`
  return 'Stock levels OK'
}

export function formatStockTotalItemsLabel(totalItems, inactiveItems = 0) {
  const total = Number(totalItems) || 0
  const inactive = Number(inactiveItems) || 0
  if (inactive <= 0) return String(total)
  return `${total} · +${inactive} inactive`
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
  return formatInventoryUnit(value, unit)
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

export function getStockMovementLabel(type, note = '') {
  const movement = type && typeof type === 'object' ? type : null
  const resolvedType = movement ? movement.type : type
  const resolvedNote = movement ? movement.note : note
  if (resolvedType === 'usage' && isWasteNote(resolvedNote)) return 'Waste'
  if (resolvedType === 'receive') return 'Receive'
  if (resolvedType === 'usage') return 'Usage'
  if (resolvedType === 'adjustment') return 'Adjustment'
  if (resolvedType === 'stock_count') return 'Stock count'
  return 'Update'
}

export function formatStockMovementRelativeTime(value, now = new Date(), timeZone = '') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const time = formatTimestampTime24(date, '', timeZone)
  const todayKey = calendarDayKey(now, timeZone)
  const dateKey = calendarDayKey(date, timeZone)

  if (dateKey && dateKey === todayKey) return `Today ${time}`
  if (dateKey && dateKey === previousCalendarDayKey(todayKey)) return `Yesterday ${time}`

  const dayLabel = formatInVenueZone(date, {
    day: 'numeric',
    month: 'short',
  }, timeZone)

  return `${dayLabel} ${time}`
}

export function formatStockMovementTimestamp(value) {
  return formatStockMovementRelativeTime(value)
}

export function formatStockLastMovementLine(movement) {
  if (!movement?.type) return ''
  const label = getStockMovementLabel(movement)
  const when = formatStockMovementRelativeTime(movement.createdAt)
  return when ? `${label} • ${when}` : label
}

export { computeSuggestedOrder }
