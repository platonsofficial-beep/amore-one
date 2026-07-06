const FAST_MOVING_DAYS = 7
const STALE_COUNT_DAYS = 14

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
  const lastMovement = item?.lastMovement
  const daysSinceMovement = getDaysSince(lastMovement?.createdAt, now)

  if (!supplier) {
    insights.push({ id: 'no-supplier', label: 'No supplier', tone: 'warning' })
  }

  if (canManage && (!Number.isFinite(costPrice) || costPrice <= 0)) {
    insights.push({ id: 'no-cost', label: 'No cost price', tone: 'muted' })
  }

  if (!lastCount?.createdAt || daysSinceCount > STALE_COUNT_DAYS) {
    insights.push({ id: 'not-counted', label: 'Not counted recently', tone: 'warning' })
  }

  if (lastMovement?.type === 'usage' && daysSinceMovement <= FAST_MOVING_DAYS) {
    insights.push({ id: 'fast-moving', label: 'Fast moving', tone: 'gold' })
  }

  return insights.slice(0, 2)
}

export function getStockDashboardEmptyState({
  hasNoItems = false,
  hasNoMatches = false,
  statusFilter = 'all',
} = {}) {
  if (hasNoItems) {
    return {
      title: 'No products yet',
      message: 'Add your first product to start workspace stock tracking.',
      showAddButton: true,
    }
  }

  if (!hasNoMatches) return null

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
