import { formatStockOrderNumber, normalizeStockOrderStatus } from './stockOrderUtils'

export const STOCK_ORDER_STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'received', label: 'Received' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const STOCK_ORDER_SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'supplier-az', label: 'Supplier A–Z' },
  { id: 'highest-value', label: 'Highest value' },
  { id: 'status', label: 'Status' },
]

const STATUS_SORT_PRIORITY = {
  draft: 0,
  sent: 1,
  received: 2,
  cancelled: 3,
}

function getOrderSearchHaystack(order) {
  const orderNumber = formatStockOrderNumber(order.orderNumber).replace('#', '')
  const productNames = (order.items ?? []).map((item) => item.itemName ?? '').join(' ')

  return [
    orderNumber,
    String(order.orderNumber ?? ''),
    order.supplier ?? '',
    productNames,
    order.createdByName ?? '',
  ].join(' ').toLowerCase()
}

export function filterStockOrders(
  orders = [],
  {
    statusFilter = 'all',
    searchTerm = '',
  } = {},
) {
  const normalizedSearch = `${searchTerm ?? ''}`.trim().toLowerCase()

  return (orders ?? []).filter((order) => {
    const status = normalizeStockOrderStatus(order.status)
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    const matchesSearch = !normalizedSearch || getOrderSearchHaystack(order).includes(normalizedSearch)
    return matchesStatus && matchesSearch
  })
}

export function sortStockOrders(orders = [], sortKey = 'newest') {
  const list = [...(orders ?? [])]

  list.sort((left, right) => {
    if (sortKey === 'oldest') {
      return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime()
    }

    if (sortKey === 'supplier-az') {
      return `${left.supplier ?? ''}`.localeCompare(`${right.supplier ?? ''}`, undefined, {
        sensitivity: 'base',
      })
    }

    if (sortKey === 'highest-value') {
      return (Number(right.totalCost) || 0) - (Number(left.totalCost) || 0)
    }

    if (sortKey === 'status') {
      const leftPriority = STATUS_SORT_PRIORITY[normalizeStockOrderStatus(left.status)] ?? 99
      const rightPriority = STATUS_SORT_PRIORITY[normalizeStockOrderStatus(right.status)] ?? 99
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime()
    }

    return new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime()
  })

  return list
}

export function getStockOrdersEmptyState(statusFilter = 'all', hasAnyOrders = false) {
  if (!hasAnyOrders) {
    return {
      title: 'No orders yet',
      description: 'Create your first supplier order from low-stock products.',
      showCreate: true,
    }
  }

  if (statusFilter === 'draft') {
    return {
      title: 'No draft orders',
      description: 'Draft orders you are preparing will appear here.',
      showCreate: true,
    }
  }

  if (statusFilter === 'sent') {
    return {
      title: 'No sent orders waiting',
      description: 'Orders sent to suppliers and awaiting delivery will appear here.',
      showCreate: false,
    }
  }

  if (statusFilter === 'received') {
    return {
      title: 'No received orders history',
      description: 'Completed deliveries and receiving history will appear here.',
      showCreate: false,
    }
  }

  if (statusFilter === 'cancelled') {
    return {
      title: 'No cancelled orders',
      description: 'Cancelled purchase orders will appear here.',
      showCreate: false,
    }
  }

  return {
    title: 'No matching orders',
    description: 'Try adjusting your search or status filters.',
    showCreate: false,
  }
}
