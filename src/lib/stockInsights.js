import { resolveStockStorageLocation, selectItemsToOrder, computeSuggestedOrder } from './stockCatalog'
import { filterStockDashboardItems } from './stockDashboardBrowse'
import { buildStockDashboardSummary, resolveStockItemQuantityStatus } from './stockUtils'

const STALE_COUNT_DAYS = 14

export const STOCK_ATTENTION_GROUPS = [
  { id: 'out', label: 'Out of stock', tone: 'danger' },
  { id: 'low', label: 'Low', tone: 'warning' },
  { id: 'count', label: 'Needs count', tone: 'warning' },
  { id: 'data', label: 'Missing supplier or cost', tone: 'muted' },
]

export function getStockAttentionGroupLabel(groupId, canManage = false) {
  if (groupId === 'data') {
    return canManage ? 'Missing supplier or cost' : 'Missing supplier'
  }

  const group = STOCK_ATTENTION_GROUPS.find((entry) => entry.id === groupId)
  return group?.label ?? groupId
}

function getDaysSince(value, now = new Date()) {
  if (!value) return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return (now.getTime() - date.getTime()) / 86_400_000
}

export function getStockItemInsights(item, { canManage = false, now = new Date() } = {}) {
  const insights = []
  const supplier = `${item?.supplier ?? ''}`.trim()
  const costPrice = Number(item?.costPrice ?? item?.cost_price)
  const lastCount = item?.lastCount
  const daysSinceCount = getDaysSince(lastCount?.createdAt, now)

  if (!supplier) {
    insights.push({ id: 'no-supplier', label: 'No supplier', tone: 'warning' })
  }

  if (canManage && (!Number.isFinite(costPrice) || costPrice <= 0)) {
    insights.push({ id: 'no-cost', label: 'No cost price', tone: 'muted' })
  }

  if (!lastCount?.createdAt || daysSinceCount > STALE_COUNT_DAYS) {
    insights.push({
      id: 'not-counted',
      label: formatLastCountAgeLabel(daysSinceCount, lastCount?.createdAt),
      tone: 'warning',
    })
  }

  return insights
}

function formatLastCountAgeLabel(daysSinceCount, lastCountCreatedAt) {
  if (!lastCountCreatedAt) {
    return 'Last count: never'
  }

  const days = Math.max(0, Math.floor(daysSinceCount))
  if (days === 0) return 'Last count: today'
  if (days === 1) return 'Last count: 1 day ago'
  return `Last count: ${days} days ago`
}

function itemNeedsCount(item, now = new Date()) {
  const lastCount = item?.lastCount
  const daysSinceCount = getDaysSince(lastCount?.createdAt, now)
  return !lastCount?.createdAt || daysSinceCount > STALE_COUNT_DAYS
}

function itemMissingSupplierOrCost(item, canManage = false) {
  const supplier = `${item?.supplier ?? ''}`.trim()
  const costPrice = Number(item?.costPrice ?? item?.cost_price)

  if (!supplier) return true
  if (canManage && (!Number.isFinite(costPrice) || costPrice <= 0)) return true
  return false
}

function quantityStatus(item) {
  return item?.status || resolveStockItemQuantityStatus(item)
}

/**
 * To-order products grouped by supplier. Membership is selectItemsToOrder,
 * so the group counts add up to the To order KPI (not Out + Low).
 */
/**
 * Out and low match the dashboard KPIs: every active item.
 * The item count is the To order set only.
 * Under target is a to-order item that is neither out nor low.
 */
export function summarizeToOrderBreakdown(items = []) {
  const list = Array.isArray(items) ? items : []
  const summary = buildStockDashboardSummary(list)
  const selected = selectItemsToOrder(list)
  let underTarget = 0
  selected.forEach((item) => {
    const status = resolveStockItemQuantityStatus(item)
    if (status !== 'out' && status !== 'low') underTarget += 1
  })
  return {
    total: selected.length,
    out: summary.outOfStock,
    low: summary.lowStock,
    underTarget,
  }
}

/** "131 items · 16 out · 24 low · 91 under target" */
export function formatToOrderBreakdown(items = [], summary = null) {
  const breakdown = summarizeToOrderBreakdown(items)
  const out = summary && summary.outOfStock != null ? summary.outOfStock : breakdown.out
  const low = summary && summary.lowStock != null ? summary.lowStock : breakdown.low
  const itemsLabel = breakdown.total === 1 ? '1 item' : `${breakdown.total} items`
  return `${itemsLabel} · ${out} out · ${low} low · ${breakdown.underTarget} under target`
}

export function buildToOrderSupplierGroups(items = []) {
  const groups = new Map()

  selectItemsToOrder(items).forEach((item) => {
    const status = quantityStatus(item)
    const supplier = `${item.supplier ?? ''}`.trim() || 'No supplier'
    const current = groups.get(supplier) ?? { supplier, count: 0, out: 0, low: 0, quantity: 0 }
    current.count += 1
    current.quantity += computeSuggestedOrder(item)
    if (status === 'out' || status === 'low') current[status] += 1
    groups.set(supplier, current)
  })

  return Array.from(groups.values()).sort((left, right) => {
    if (left.count !== right.count) return right.count - left.count
    return left.supplier.localeCompare(right.supplier)
  })
}

/**
 * Products that are in stock but stale or never counted, grouped by storage.
 * Out and low stay on To order so this number stays small.
 */
export function buildToCountStorageGroups(items = [], { canManage = false, now = new Date() } = {}) {
  const groups = new Map()

  ;(items ?? []).forEach((item) => {
    if (!item || item.active === false) return
    const annotated = item.status ? item : { ...item, status: resolveStockItemQuantityStatus(item) }
    if (getStockItemAttentionPriority(annotated, { canManage, now }) !== 'count') return
    const storage = resolveStockStorageLocation(annotated) || 'Unassigned'
    const current = groups.get(storage) ?? { storage, count: 0 }
    current.count += 1
    groups.set(storage, current)
  })

  return Array.from(groups.values()).sort((left, right) => {
    if (left.count !== right.count) return right.count - left.count
    return left.storage.localeCompare(right.storage)
  })
}

export function getStockItemAttentionPriority(item, { canManage = false, now = new Date() } = {}) {
  if (item?.active === false) return null
  if (item.status === 'out') return 'out'
  if (item.status === 'low') return 'low'
  if (itemNeedsCount(item, now)) return 'count'
  if (itemMissingSupplierOrCost(item, canManage)) return 'data'
  return null
}

export function buildStockNeedsAttentionGroups(
  items = [],
  { canManage = false, searchTerm = '', now = new Date() } = {},
) {
  const candidates = filterStockDashboardItems(items, {
    categoryFilter: 'All',
    statusFilter: 'all',
    searchTerm,
  })

  const groups = STOCK_ATTENTION_GROUPS.map((group) => ({ ...group, items: [] }))
  const groupById = Object.fromEntries(groups.map((group) => [group.id, group]))

  candidates.forEach((item) => {
    const priority = getStockItemAttentionPriority(item, { canManage, now })
    if (!priority) return
    groupById[priority].items.push(item)
  })

  groups.forEach((group) => {
    group.items.sort((left, right) => `${left.name ?? ''}`.localeCompare(`${right.name ?? ''}`, undefined, { sensitivity: 'base' }))
    group.label = getStockAttentionGroupLabel(group.id, canManage)
  })

  return groups.filter((group) => group.items.length > 0)
}

/**
 * P8.17.2 — Presentation-only preview limit for Needs Attention rows.
 * Does not change grouping, severity, or which products need attention.
 */
export const STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT = 5

export function sliceStockNeedsAttentionGroupItems(
  items = [],
  {
    limit = STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT,
    expanded = false,
  } = {},
) {
  const list = Array.isArray(items) ? items : []
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.floor(Number(limit))
    : STOCK_NEEDS_ATTENTION_PREVIEW_LIMIT

  if (expanded || list.length <= safeLimit) {
    return {
      visibleItems: list,
      hiddenCount: 0,
    }
  }

  return {
    visibleItems: list.slice(0, safeLimit),
    hiddenCount: list.length - safeLimit,
  }
}

export function getStockDashboardEmptyState({
  hasNoItems = false,
  hasNoMatches = false,
  statusFilter = 'all',
  visibilityFilter = 'active',
  hasInactiveProducts = false,
  canManage = false,
} = {}) {
  if (hasNoItems) {
    return {
      title: canManage ? 'No products yet' : 'No stock items',
      message: canManage
        ? 'Add your first product to start workspace stock tracking.'
        : 'Stock levels will appear here once products are added.',
      showAddButton: canManage,
    }
  }

  if (!hasNoMatches) return null

  if (visibilityFilter === 'inactive') {
    return {
      title: 'No inactive products found',
      message: 'Deactivated products will appear here.',
      showAddButton: false,
    }
  }

  if (visibilityFilter === 'active' && hasInactiveProducts) {
    return {
      title: 'No active products found',
      message: 'Try switching Visibility to Inactive or All.',
      showAddButton: false,
    }
  }

  if (statusFilter === 'low') {
    return {
      title: 'No low stock items',
      message: 'Everything is stocked.',
      showAddButton: false,
    }
  }

  if (statusFilter === 'out') {
    return {
      title: 'No out of stock items',
      message: 'Everything is stocked.',
      showAddButton: false,
    }
  }

  if (statusFilter === 'order') {
    return {
      title: 'Nothing to order',
      message: 'Stock levels look healthy.',
      showAddButton: false,
    }
  }

  return {
    title: 'No products found',
    message: 'Try changing filters or search.',
    showAddButton: false,
  }
}
