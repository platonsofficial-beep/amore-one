import { computeSuggestedOrder, itemNeedsOrder } from './stockCatalog'

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

  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

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
