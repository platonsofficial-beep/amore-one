import {
  buildSupplierMetrics,
  buildSupplierSearchHaystack,
  isSupplierActive,
} from './stockSupplierUtils'

export const STOCK_SUPPLIER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'has-open-orders', label: 'Has open orders' },
]

export function filterStockSuppliers(
  suppliers = [],
  {
    statusFilter = 'all',
    searchTerm = '',
    stockItems = [],
    stockOrders = [],
  } = {},
) {
  const normalizedSearch = `${searchTerm ?? ''}`.trim().toLowerCase()

  return (suppliers ?? []).filter((supplier) => {
    const metrics = buildSupplierMetrics(supplier, stockItems, stockOrders)

    const matchesFilter = (() => {
      if (statusFilter === 'active') return isSupplierActive(supplier)
      if (statusFilter === 'inactive') return !isSupplierActive(supplier)
      if (statusFilter === 'has-open-orders') return metrics.openOrdersCount > 0
      return true
    })()

    const matchesSearch = !normalizedSearch
      || buildSupplierSearchHaystack(supplier, stockItems).includes(normalizedSearch)

    return matchesFilter && matchesSearch
  })
}

export function sortStockSuppliers(suppliers = [], stockItems = [], stockOrders = [], sortKey = 'name-az') {
  const list = [...(suppliers ?? [])]

  list.sort((left, right) => {
    const leftMetrics = buildSupplierMetrics(left, stockItems, stockOrders)
    const rightMetrics = buildSupplierMetrics(right, stockItems, stockOrders)

    if (sortKey === 'spend-desc') {
      return rightMetrics.totalSpend - leftMetrics.totalSpend
    }

    if (sortKey === 'orders-desc') {
      return rightMetrics.openOrdersCount - leftMetrics.openOrdersCount
        || rightMetrics.totalOrders - leftMetrics.totalOrders
    }

    if (sortKey === 'recent-order') {
      return (rightMetrics.lastOrderDate ?? 0) - (leftMetrics.lastOrderDate ?? 0)
    }

    return `${left.companyName ?? ''}`.localeCompare(`${right.companyName ?? ''}`, undefined, {
      sensitivity: 'base',
    })
  })

  return list
}

export function getStockSuppliersEmptyState(statusFilter = 'all', hasAnySuppliers = false) {
  if (!hasAnySuppliers) {
    return {
      title: 'No suppliers yet',
      description: 'Add your first supplier to connect products and purchase orders.',
      showCreate: true,
    }
  }

  if (statusFilter === 'active') {
    return {
      title: 'No active suppliers',
      description: 'Activate a supplier or adjust your filters.',
      showCreate: false,
    }
  }

  if (statusFilter === 'inactive') {
    return {
      title: 'No inactive suppliers',
      description: 'Suppliers you deactivate will appear here.',
      showCreate: false,
    }
  }

  if (statusFilter === 'has-open-orders') {
    return {
      title: 'No suppliers with open orders',
      description: 'Draft and sent orders will appear here when suppliers have pending deliveries.',
      showCreate: false,
    }
  }

  return {
    title: 'No suppliers match your search',
    description: 'Try a different search term or clear filters.',
    showCreate: false,
  }
}

export const STOCK_SUPPLIER_SORT_OPTIONS = [
  { id: 'name-az', label: 'Name A–Z' },
  { id: 'spend-desc', label: 'Highest spend' },
  { id: 'orders-desc', label: 'Most open orders' },
  { id: 'recent-order', label: 'Recent order' },
]
