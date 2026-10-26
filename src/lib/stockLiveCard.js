import { formatLastCountedLabel } from './stockProductHistory'
import { buildStockOrdersOperationsSummary } from './stockOrderUtils'
import { countBelowParByStorage, formatItemsBelowPar } from './stockStoragePar'

export function sumBelowParCounts(counts) {
  let total = 0
  counts?.forEach?.((count) => {
    total += Math.max(0, Number(count) || 0)
  })
  return total
}

export function countWorkspaceItemsBelowPar({ balances = [], pars = [] } = {}) {
  return sumBelowParCounts(countBelowParByStorage({ balances, pars }))
}

export function latestStockCountAt(items = []) {
  let latestTime = 0
  let latestValue = null

  ;(items ?? []).forEach((item) => {
    if (item?.active === false) return
    const raw = item?.lastCount?.createdAt ?? item?.lastCount?.created_at ?? null
    const time = raw ? new Date(raw).getTime() : NaN
    if (!Number.isFinite(time) || time <= latestTime) return
    latestTime = time
    latestValue = raw
  })

  return latestValue
}

export function formatLastCountFact(lastCountedAt, now = new Date()) {
  if (!lastCountedAt) return 'No counts yet'
  const label = formatLastCountedLabel({ createdAt: lastCountedAt }, now)
  if (!label || label === 'Never') return 'No counts yet'
  if (label === 'Today') return 'Last count today'
  return `Last count ${label.charAt(0).toLowerCase()}${label.slice(1)}`
}

/**
 * Label for the Today row that opens Inventory Count.
 * Uses the latest inventory-count session start, the same order as that screen.
 */
export function formatInventoryCountFact(startedAt, now = new Date()) {
  if (!startedAt) return 'No inventory counts yet'
  const date = new Date(startedAt)
  if (Number.isNaN(date.getTime())) return 'No inventory counts yet'

  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  if (sameDay) return 'Last inventory count today'

  const label = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date)
  return `Last inventory count ${label}`
}

export function buildStockLiveFacts({
  belowParCount = 0,
  parsReady = false,
  orders = [],
  lastInventoryCountAt = null,
  now = new Date(),
} = {}) {
  const draftCount = buildStockOrdersOperationsSummary(orders).draftCount
  const belowPar = Math.max(0, Number(belowParCount) || 0)

  return {
    belowParLabel: parsReady ? formatItemsBelowPar(belowPar) : 'Pars not available yet',
    belowParTone: parsReady && belowPar > 0 ? 'warning' : 'default',
    draftCount,
    draftLabel: draftCount === 1 ? '1 open draft' : `${draftCount} open drafts`,
    draftTone: draftCount > 0 ? 'warning' : 'default',
    lastCountLabel: formatInventoryCountFact(lastInventoryCountAt, now),
  }
}
