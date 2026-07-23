/**
 * P8.16.25 — Single product permanent delete confirmation helpers.
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
 * Case-insensitive, trimmed phrase match.
 * @param {string} value
 * @param {string} productName
 */
export function matchesStockItemPermanentDeletePhrase(value, productName) {
  const expected = buildStockItemPermanentDeletePhrase(productName).toUpperCase()
  const actual = `${value ?? ''}`.trim().toUpperCase()
  return expected.length > 0 && actual === expected
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
    return 'This product is in an open inventory count. Finish or cancel that count first.'
  }
  if (message.includes('incorrect password') || message.includes('invalid login')) {
    return 'Incorrect password. Please try again.'
  }

  return error?.message || 'Unable to permanently delete this product right now. Please try again.'
}
