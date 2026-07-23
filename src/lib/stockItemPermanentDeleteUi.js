/**
 * P8.16.25 / P8.16.26c / P8.16.29 — Single product permanent delete confirmation helpers.
 */

/**
 * @param {string} productName
 * @returns {string}
 */
export function buildStockItemPermanentDeletePhrase(productName) {
  const name = `${productName ?? ''}`.trim()
  return name ? `DELETE ${name}` : 'DELETE'
}

/**
 * Normalize confirmation text for comparison only.
 * Does not alter the live input value while typing.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeStockItemPermanentDeletePhrase(value) {
  return `${value ?? ''}`
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, '')
}

/**
 * Intentional phrase match after normalization.
 * Requires the full product name; formatting differences are ignored.
 *
 * @param {string} value
 * @param {string} productName
 */
export function matchesStockItemPermanentDeletePhrase(value, productName) {
  const expected = normalizeStockItemPermanentDeletePhrase(
    buildStockItemPermanentDeletePhrase(productName),
  )
  const actual = normalizeStockItemPermanentDeletePhrase(value)
  return expected.length > 0 && actual === expected
}

const OPEN_COUNT_FALLBACK =
  'This product is in an open inventory count. Finish or cancel that count first.'

function formatBlockStartedDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Structured Permanent Delete guidance when an open Inventory Count blocks deletion.
 * Falls back to the generic message when blocker metadata is unavailable.
 *
 * @param {{ productName?: string, blocker?: object | null }} args
 */
export function buildOpenInventoryCountBlockDetails({
  productName = '',
  blocker = null,
} = {}) {
  const name = `${productName ?? ''}`.trim()
  if (!blocker?.sessionId) {
    return {
      title: 'Blocked by Inventory Count',
      fallbackMessage: OPEN_COUNT_FALLBACK,
      fields: null,
      guidance: 'Finish or cancel that count before permanently deleting this product.',
    }
  }

  const fields = [
    { label: 'Product', value: name || '—' },
    {
      label: 'Session',
      value: `${blocker.countTypeLabel || blocker.countType || 'Inventory Count'}`.trim() || '—',
    },
    { label: 'Status', value: `${blocker.statusLabel || blocker.status || '—'}`.trim() || '—' },
    { label: 'Location', value: `${blocker.storageLocation || '—'}`.trim() || '—' },
    { label: 'Started', value: formatBlockStartedDate(blocker.startedAt) || '—' },
    { label: 'Operator', value: `${blocker.operatorName || '—'}`.trim() || '—' },
  ]

  return {
    title: 'Blocked by Inventory Count',
    fallbackMessage: null,
    fields,
    guidance: 'Finish or cancel this count before permanently deleting this product.',
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function friendlyStockItemPermanentDeleteError(error) {
  const code = `${error?.code ?? ''}`.toUpperCase()
  const message = `${error?.message ?? ''}`.toLowerCase()

  if (code === 'FORBIDDEN' || message.includes('forbidden')) {
    return 'You do not have permission to permanently delete this product.'
  }
  if (code === 'UNAUTHENTICATED') {
    return 'Please sign in again to continue.'
  }
  if (code === 'WORKSPACE_REQUIRED' || code === 'WORKSPACE_NOT_FOUND') {
    return 'This workspace is not ready for permanent delete right now.'
  }
  if (code === 'ITEM_REQUIRED' || code === 'ITEM_NOT_FOUND') {
    return 'This product could not be found in the current workspace.'
  }
  if (code === 'BLOCKED_DRAFT_ORDER') {
    return 'This product is on a draft purchase order. Remove it from the draft order first.'
  }
  if (code === 'BLOCKED_SENT_ORDER') {
    return 'This product is on a sent purchase order. Resolve the sent order first.'
  }
  if (code === 'BLOCKED_OPEN_COUNT') {
    return OPEN_COUNT_FALLBACK
  }
  if (message.includes('incorrect password') || message.includes('invalid login')) {
    return 'Incorrect password. Please try again.'
  }

  return error?.message || 'Unable to permanently delete this product right now. Please try again.'
}
