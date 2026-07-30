import {
  itemNeedsOrder,
  resolveStockItemType,
  resolveStockStorageLocation,
} from './stockCatalog'
import { buildStockProductSearchHaystack } from './stockProductMetadataDisplay'
import { resolveStockItemQuantityStatus } from './stockUtils'

export const STOCK_LAYOUT_MODES = [
  { id: 'cards', label: 'Cards', icon: 'grid' },
  { id: 'list', label: 'List', icon: 'list' },
  { id: 'compact', label: 'Count', icon: 'count' },
]

export const STOCK_GROUP_BY_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'category', label: 'Category' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'type', label: 'Type' },
  { id: 'location', label: 'Location' },
]

export const STOCK_SORT_OPTIONS = [
  { id: 'name-asc', label: 'A–Z' },
  { id: 'name-desc', label: 'Z–A' },
  { id: 'low-first', label: 'Low stock first' },
  { id: 'out-first', label: 'Out of stock first' },
  { id: 'recent', label: 'Recently updated' },
]

export const STOCK_VISIBILITY_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'all', label: 'All' },
]

const STATUS_SORT_PRIORITY = {
  out: 0,
  low: 1,
  ok: 2,
  inactive: 3,
}

function getItemSearchHaystack(item) {
  const itemType = resolveStockItemType(item)
  const location = resolveStockStorageLocation(item)

  return buildStockProductSearchHaystack(item, { itemType, location })
}

function getItemUpdatedTimestamp(item) {
  const updatedAt = Date.parse(item.updatedAt ?? item.updated_at ?? '') || 0
  const movementAt = Date.parse(item.lastMovement?.createdAt ?? '') || 0
  return Math.max(updatedAt, movementAt)
}

function compareStrings(left, right) {
  return `${left ?? ''}`.localeCompare(`${right ?? ''}`, undefined, { sensitivity: 'base' })
}

function matchesVisibilityFilter(item, visibilityFilter = 'active') {
  const isActive = item?.active !== false
  if (visibilityFilter === 'inactive') return !isActive
  if (visibilityFilter === 'all') return true
  return isActive
}

export function filterStockDashboardItems(
  items = [],
  {
    categoryFilter = 'All',
    statusFilter = 'all',
    visibilityFilter = 'active',
    searchTerm = '',
  } = {},
) {
  const normalizedSearch = `${searchTerm ?? ''}`.trim().toLowerCase()

  return (items ?? []).filter((item) => {
    if (!matchesVisibilityFilter(item, visibilityFilter)) return false

    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter
    // P8.24.1 — Status is quantity health; Visibility is lifecycle. Keep them orthogonal.
    // KPI cards still count active items only (buildStockDashboardSummary), then quantity status.
    const quantityStatus = resolveStockItemQuantityStatus(item)
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'low' && quantityStatus === 'low')
      || (statusFilter === 'out' && quantityStatus === 'out')
      || (statusFilter === 'ok' && quantityStatus === 'ok')
      || (statusFilter === 'order' && itemNeedsOrder(item))
    const matchesSearch = !normalizedSearch || getItemSearchHaystack(item).includes(normalizedSearch)

    return matchesCategory && matchesStatus && matchesSearch
  })
}

export function sortStockDashboardItems(items = [], sortKey = 'name-asc') {
  const list = [...(items ?? [])]

  list.sort((left, right) => {
    if (sortKey === 'name-desc') {
      return compareStrings(right.name, left.name)
    }

    if (sortKey === 'name-asc') {
      return compareStrings(left.name, right.name)
    }

    if (sortKey === 'low-first') {
      const leftPriority = STATUS_SORT_PRIORITY[left.status] ?? 99
      const rightPriority = STATUS_SORT_PRIORITY[right.status] ?? 99
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return compareStrings(left.name, right.name)
    }

    if (sortKey === 'out-first') {
      const leftOut = left.status === 'out' ? 0 : 1
      const rightOut = right.status === 'out' ? 0 : 1
      if (leftOut !== rightOut) return leftOut - rightOut
      return compareStrings(left.name, right.name)
    }

    if (sortKey === 'recent') {
      return getItemUpdatedTimestamp(right) - getItemUpdatedTimestamp(left)
    }

    return compareStrings(left.name, right.name)
  })

  return list
}

function resolveGroupKey(item, groupBy) {
  if (groupBy === 'category') {
    return `${item.category ?? ''}`.trim() || 'Other'
  }

  if (groupBy === 'supplier') {
    return `${item.supplier ?? ''}`.trim() || 'No supplier'
  }

  if (groupBy === 'type') {
    return resolveStockItemType(item)
  }

  if (groupBy === 'location') {
    return resolveStockStorageLocation(item)
  }

  return ''
}

export function groupStockDashboardItems(items = [], groupBy = 'none') {
  if (groupBy === 'none' || !groupBy) {
    return [{ key: '', label: '', items }]
  }

  const groups = new Map()

  ;(items ?? []).forEach((item) => {
    const key = resolveGroupKey(item, groupBy)
    const existing = groups.get(key) ?? []
    existing.push(item)
    groups.set(key, existing)
  })

  return Array.from(groups.entries())
    .sort(([leftKey], [rightKey]) => compareStrings(leftKey, rightKey))
    .map(([key, groupItems]) => ({
      key,
      label: key,
      items: groupItems,
    }))
}

/**
 * P8.17.3 — Enter on Stock search dismisses the iPad/soft keyboard
 * without changing the live-filtered search results.
 */
export function dismissStockSearchKeyboardOnEnter(event) {
  if (!event || event.key !== 'Enter') return false
  event.preventDefault?.()
  event.currentTarget?.blur?.()
  return true
}

/**
 * P8.17.3c — Human labels for the existing statusFilter values.
 * Matches KPI card wording; does not invent new terminology.
 */
export function getStockStatusFilterLabel(statusFilter = 'all') {
  if (statusFilter === 'low') return 'Low stock'
  if (statusFilter === 'out') return 'Out of stock'
  if (statusFilter === 'order') return 'To order'
  return 'All products'
}
