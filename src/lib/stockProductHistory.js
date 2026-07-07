import { applyStockMovementQuantity } from './stockUtils'

export function buildStockMovementTimeline(movements = [], currentQuantity = 0) {
  const chronological = [...(movements ?? [])].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt ?? '') || 0
    const rightTime = Date.parse(right?.createdAt ?? '') || 0
    return leftTime - rightTime
  })

  let running = 0

  const enriched = chronological.map((movement) => {
    const before = running
    const after = applyStockMovementQuantity(before, movement.type, movement.quantity)
    running = after

    return {
      ...movement,
      quantityBefore: before,
      quantityAfter: after,
    }
  })

  if (enriched.length > 0) {
    const newest = enriched[enriched.length - 1]
    const current = Number(currentQuantity)
    if (Number.isFinite(current) && Number(newest.quantityAfter) !== current) {
      newest.quantityAfter = current
    }
  }

  return enriched.reverse()
}

export function buildStockMonthlyInsights(movements = [], now = new Date()) {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let received = 0
  let used = 0
  let adjustments = 0

  ;(movements ?? []).forEach((movement) => {
    const createdAt = Date.parse(movement?.createdAt ?? '')
    if (!createdAt || createdAt < startOfMonth.getTime()) return

    const quantity = Number(movement?.quantity)
    if (!Number.isFinite(quantity)) return

    if (movement.type === 'receive') {
      received += Math.abs(quantity)
      return
    }

    if (movement.type === 'usage') {
      used += Math.abs(quantity)
      return
    }

    if (movement.type === 'adjustment') {
      adjustments += quantity
    }
  })

  return { received, used, adjustments }
}

export function formatLastCountedLabel(lastCount, now = new Date()) {
  const createdAt = lastCount?.createdAt
  if (!createdAt) return 'Never'

  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return 'Never'

  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function getStockMovementTone(type) {
  if (type === 'receive') return 'receive'
  if (type === 'usage') return 'usage'
  if (type === 'adjustment') return 'adjustment'
  if (type === 'stock_count') return 'count'
  return 'neutral'
}

export function formatStockMovementHeadline(movement, unit = '') {
  const quantity = Number(movement?.quantity)
  if (!Number.isFinite(quantity)) return ''

  if (movement.type === 'stock_count') {
    return `Set to ${formatQuantityWithUnit(Math.abs(quantity), unit)}`
  }

  if (movement.type === 'receive') {
    return `+${formatQuantityWithUnit(Math.abs(quantity), unit)}`
  }

  if (movement.type === 'usage') {
    return `-${formatQuantityWithUnit(Math.abs(quantity), unit)}`
  }

  const sign = quantity >= 0 ? '+' : '-'
  return `${sign}${formatQuantityWithUnit(Math.abs(quantity), unit)}`
}

export function formatStockMovementTypeLabel(type) {
  if (type === 'receive') return 'Receive'
  if (type === 'usage') return 'Usage'
  if (type === 'adjustment') return 'Adjustment'
  if (type === 'stock_count') return 'Stock count'
  return 'Update'
}

function formatQuantityWithUnit(value, unit = '') {
  const quantity = Number(value)
  const formatted = Number.isFinite(quantity)
    ? (Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, ''))
    : '0'
  const normalizedUnit = `${unit ?? ''}`.trim()
  return normalizedUnit ? `${formatted} ${normalizedUnit}` : formatted
}

export function formatStockProductHistoryTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return `${day} ${time}`
}

export function formatMonthlyMovementStat(type, value, unit = '') {
  const quantity = Number(value)
  const isZero = !Number.isFinite(quantity) || quantity === 0

  if (type === 'received' && isZero) return 'No receives'
  if (type === 'used' && isZero) return 'No usage'
  if (type === 'adjustments' && isZero) return 'No adjustments'

  return formatQuantityWithUnit(quantity, unit)
}
