/** Same note contract as waste logging. Waste is usage whose note starts with this prefix. */
export const USAGE_REPORT_WASTE_PREFIX = 'Waste · '

/**
 * Inventory Count home returns `{ active, paused, recent }`, not a list.
 * A raw session list and a `{ data }` payload are accepted too.
 * Anything else becomes an empty list so `.filter` cannot throw.
 * @param {unknown} payload
 * @returns {object[]}
 */
export function collectUsageReportSessions(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.data)) return payload.data
  const buckets = ['active', 'paused', 'recent']
  if (buckets.some((key) => Array.isArray(payload[key]))) {
    return buckets.flatMap((key) => (Array.isArray(payload[key]) ? payload[key] : []))
  }
  return []
}

/**
 * Posted counts only. Reversed posted counts stay out of the picker.
 * @param {unknown} payload
 */
export function listPostedUsageCounts(payload) {
  return collectUsageReportSessions(payload)
    .filter((session) => (
      session?.status === 'posted'
      && Boolean(session.postedAt)
      && !`${session.reversedAt ?? ''}`.trim()
    ))
    .slice()
    .sort((left, right) => Date.parse(left.postedAt) - Date.parse(right.postedAt))
}

/** @param {unknown} value */
export function asUsageReportList(value) {
  return Array.isArray(value) ? value : []
}

function roundQty(value) {
  return Math.round(Number(value) * 10000) / 10000
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}

function itemIdOf(record) {
  return `${record?.itemId ?? record?.item_id ?? record?.id ?? ''}`.trim()
}

function countedQuantityOf(line) {
  const raw = line?.countedQuantity ?? line?.counted_quantity
  if (raw == null || `${raw}`.trim() === '') return null
  const quantity = Number(raw)
  return Number.isFinite(quantity) ? quantity : null
}

function positiveCost(item) {
  const raw = item?.costPrice ?? item?.cost_price
  if (raw == null || `${raw}`.trim() === '') return null
  const cost = Number(raw)
  if (!Number.isFinite(cost) || cost <= 0) return null
  return cost
}

function aggregateCountLines(lines) {
  const quantities = new Map()
  const incomplete = new Set()
  const present = new Set()
  ;(lines ?? []).forEach((line) => {
    const id = itemIdOf(line)
    if (!id) return
    present.add(id)
    const quantity = countedQuantityOf(line)
    if (quantity == null) {
      incomplete.add(id)
      return
    }
    quantities.set(id, (quantities.get(id) ?? 0) + quantity)
  })
  return { quantities, incomplete, present }
}

function emptyMovements() {
  return {
    received: 0,
    waste: 0,
    loggedUse: 0,
    transfer: 0,
    adjustment: 0,
    countPosted: false,
  }
}

function classifyMovement(movement, bucket) {
  const quantity = Number(movement?.quantity)
  if (!Number.isFinite(quantity)) return
  const type = movement?.type
  if (type === 'receive') {
    bucket.received += Math.abs(quantity)
    return
  }
  if (type === 'usage') {
    const note = `${movement?.note ?? ''}`
    if (note.startsWith(USAGE_REPORT_WASTE_PREFIX)) bucket.waste += Math.abs(quantity)
    else bucket.loggedUse += Math.abs(quantity)
    return
  }
  if (type === 'transfer_in') {
    bucket.transfer += Math.abs(quantity)
    return
  }
  if (type === 'transfer_out') {
    bucket.transfer -= Math.abs(quantity)
    return
  }
  if (type === 'adjustment') {
    bucket.adjustment += quantity
    return
  }
  if (type === 'stock_count') {
    bucket.countPosted = true
  }
}

function costFor(quantity, unitCost) {
  if (quantity == null || !Number.isFinite(quantity)) return null
  if (quantity === 0) return 0
  if (unitCost == null) return null
  return roundMoney(quantity * unitCost)
}

/**
 * Opening + Received − Waste − Logged use ± Transfers ± Adjustments − Closing = Used.
 * Missing counts and missing cost stay blank. Zero is used only when the books really are zero.
 *
 * @param {{
 *   openingLines?: object[],
 *   closingLines?: object[],
 *   movements?: object[],
 *   items?: object[],
 *   movementHistoryTruncated?: boolean,
 * }} input
 */
export function buildStockUsageCostReport({
  openingLines = [],
  closingLines = [],
  movements = [],
  items = [],
  movementHistoryTruncated = false,
} = {}) {
  const opening = aggregateCountLines(openingLines)
  const closing = aggregateCountLines(closingLines)
  const movementBuckets = new Map()
  const names = new Map()

  ;(items ?? []).forEach((item) => {
    const id = `${item?.id ?? ''}`.trim()
    if (!id) return
    names.set(id, {
      name: `${item.displayName ?? item.name ?? ''}`.trim() || 'Product',
      category: `${item.category ?? ''}`.trim() || 'Other',
      unit: `${item.unit ?? ''}`.trim(),
      cost: positiveCost(item),
    })
  })

  const rememberLine = (line) => {
    const id = itemIdOf(line)
    if (!id || names.has(id)) return
    names.set(id, {
      name: `${line.itemName ?? line.item_name ?? line.name ?? ''}`.trim() || 'Product',
      category: `${line.category ?? ''}`.trim() || 'Other',
      unit: `${line.unit ?? ''}`.trim(),
      cost: null,
    })
  }
  ;(openingLines ?? []).forEach(rememberLine)
  ;(closingLines ?? []).forEach(rememberLine)

  ;(movements ?? []).forEach((movement) => {
    const id = itemIdOf(movement)
    if (!id) return
    const bucket = movementBuckets.get(id) ?? emptyMovements()
    classifyMovement(movement, bucket)
    movementBuckets.set(id, bucket)
    if (!names.has(id)) {
      names.set(id, { name: 'Product', category: 'Other', unit: '', cost: null })
    }
  })

  const ids = new Set([
    ...opening.present,
    ...closing.present,
    ...movementBuckets.keys(),
  ])

  const products = [...ids].map((id) => {
    const meta = names.get(id) ?? { name: 'Product', category: 'Other', unit: '', cost: null }
    const bucket = movementBuckets.get(id) ?? emptyMovements()
    const openingQty = opening.present.has(id) && !opening.incomplete.has(id)
      ? roundQty(opening.quantities.get(id) ?? 0)
      : null
    const closingQty = closing.present.has(id) && !closing.incomplete.has(id)
      ? roundQty(closing.quantities.get(id) ?? 0)
      : null

    let gap = ''
    if (movementHistoryTruncated) gap = 'Movement history is incomplete for this period.'
    else if (!opening.present.has(id)) gap = 'No opening count'
    else if (opening.incomplete.has(id)) gap = 'Opening count is incomplete'
    else if (!closing.present.has(id)) gap = 'No closing count'
    else if (closing.incomplete.has(id)) gap = 'Closing count is incomplete'
    else if (bucket.countPosted) gap = 'A count was posted during this period.'

    const received = roundQty(bucket.received)
    const waste = roundQty(bucket.waste)
    const loggedUse = roundQty(bucket.loggedUse)
    const transfer = roundQty(bucket.transfer)
    const adjustment = roundQty(bucket.adjustment)
    const used = gap
      ? null
      : roundQty(openingQty + received - waste - loggedUse + transfer + adjustment - closingQty)

    return {
      itemId: id,
      name: meta.name,
      category: meta.category,
      unit: meta.unit,
      costPrice: meta.cost,
      opening: openingQty,
      received,
      waste,
      loggedUse,
      transfer,
      adjustment,
      closing: closingQty,
      used,
      usageCost: costFor(used, meta.cost),
      wasteCost: costFor(waste, meta.cost),
      gap,
    }
  }).sort((left, right) => {
    const category = left.category.localeCompare(right.category)
    if (category !== 0) return category
    return left.name.localeCompare(right.name)
  })

  const categories = []
  products.forEach((product) => {
    let category = categories.find((entry) => entry.category === product.category)
    if (!category) {
      category = {
        category: product.category,
        productCount: 0,
        completeCount: 0,
        missingCountCount: 0,
        missingCostCount: 0,
        usageCost: 0,
        wasteCost: 0,
        hasUsageCost: false,
        hasWasteCost: false,
      }
      categories.push(category)
    }
    category.productCount += 1
    if (product.gap) category.missingCountCount += 1
    else category.completeCount += 1
    const missingCost = (product.used > 0 && product.usageCost == null)
      || (product.waste > 0 && product.wasteCost == null)
    if (missingCost) category.missingCostCount += 1
    if (product.usageCost != null) {
      category.usageCost = roundMoney(category.usageCost + product.usageCost)
      category.hasUsageCost = true
    }
    if (product.wasteCost != null) {
      category.wasteCost = roundMoney(category.wasteCost + product.wasteCost)
      category.hasWasteCost = true
    }
  })

  const summary = products.reduce((total, product) => {
    total.productCount += 1
    if (product.gap) total.missingCountCount += 1
    const missingCost = (product.used > 0 && product.usageCost == null)
      || (product.waste > 0 && product.wasteCost == null)
    if (missingCost) total.missingCostCount += 1
    if (product.usageCost != null) {
      total.usageCost = roundMoney(total.usageCost + product.usageCost)
      total.hasUsageCost = true
    }
    if (product.wasteCost != null) {
      total.wasteCost = roundMoney(total.wasteCost + product.wasteCost)
      total.hasWasteCost = true
    }
    return total
  }, {
    productCount: 0,
    missingCountCount: 0,
    missingCostCount: 0,
    usageCost: 0,
    wasteCost: 0,
    hasUsageCost: false,
    hasWasteCost: false,
    movementHistoryTruncated: movementHistoryTruncated === true,
  })

  return { products, categories, summary }
}
