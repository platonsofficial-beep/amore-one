export function buildManagerMobileAttentionItems({
  attentionItems = [],
  stockOrdersSummary = null,
  stockSummary = null,
  hasStockModuleData = false,
} = {}) {
  const items = [...attentionItems]
  const existingKeys = new Set(items.map((item) => item.key))

  const awaiting = Number(stockOrdersSummary?.awaitingDeliveryCount) || 0
  const partial = Number(stockOrdersSummary?.partialCount) || 0
  const drafts = Number(stockOrdersSummary?.draftCount) || 0

  if (awaiting > 0 && !existingKeys.has('orders:awaiting')) {
    items.unshift({
      key: 'orders:awaiting',
      tone: 'info',
      priority: 'urgent',
      label: awaiting === 1 ? '1 delivery to receive' : `${awaiting} deliveries to receive`,
      detail: 'Sent supplier orders waiting',
    })
  }

  if (partial > 0 && !existingKeys.has('orders:partial')) {
    items.unshift({
      key: 'orders:partial',
      tone: 'info',
      priority: 'urgent',
      label: partial === 1 ? '1 partial order open' : `${partial} partial orders open`,
      detail: 'Continue receiving stock',
    })
  }

  if (drafts > 0 && !existingKeys.has('orders:draft')) {
    items.push({
      key: 'orders:draft',
      tone: 'warning',
      priority: 'reminder',
      label: drafts === 1 ? '1 draft order' : `${drafts} draft orders`,
      detail: 'Review before sending to supplier',
    })
  }

  if (hasStockModuleData && stockSummary) {
    const outCount = Number(stockSummary.outOfStock) || 0
    const lowCount = Number(stockSummary.lowStock) || 0
    const hasStockAttention = items.some((item) => item.key.startsWith('stock:'))

    if (outCount > 0 && !hasStockAttention && !existingKeys.has('stock-module:out')) {
      items.unshift({
        key: 'stock-module:out',
        tone: 'critical',
        priority: 'urgent',
        label: outCount === 1 ? '1 item out of stock' : `${outCount} items out of stock`,
        detail: 'Check stock levels',
      })
    } else if (lowCount > 0 && !hasStockAttention && !existingKeys.has('stock-module:low')) {
      items.unshift({
        key: 'stock-module:low',
        tone: 'warning',
        priority: 'reminder',
        label: lowCount === 1 ? '1 low stock item' : `${lowCount} low stock items`,
        detail: 'Check stock levels',
      })
    }
  }

  return items
}

export function buildManagerMobileStockStatusLine(stockSummary = null, stockOrdersSummary = null) {
  const outCount = Number(stockSummary?.outOfStock) || 0
  const lowCount = Number(stockSummary?.lowStock) || 0
  const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
    + (Number(stockOrdersSummary?.partialCount) || 0)

  if (outCount > 0 && lowCount > 0) {
    return `${outCount} out · ${lowCount} low`
  }

  if (outCount > 0) {
    return outCount === 1 ? '1 item out' : `${outCount} items out`
  }

  if (lowCount > 0) {
    return lowCount === 1 ? '1 item low' : `${lowCount} items low`
  }

  if (pendingDeliveries > 0) {
    return pendingDeliveries === 1 ? '1 delivery pending' : `${pendingDeliveries} deliveries pending`
  }

  return 'Stock levels OK'
}
