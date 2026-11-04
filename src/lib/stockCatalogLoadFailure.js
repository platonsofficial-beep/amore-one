/**
 * Stock audit S-01 / S-11 — what to show when the stock catalog load fails.
 * Nothing loaded yet: the Retry card (never the "No products yet" empty state).
 * A list is already on screen (e.g. went offline): keep it and say it may be stale.
 *
 * @param {number} loadedItemCount items currently shown
 * @returns {{ showRetryCard: boolean, notice: string }}
 */
export const STOCK_CATALOG_STALE_NOTICE = 'Showing the last loaded stock. It couldn’t be refreshed — check your connection.'

export function resolveStockCatalogLoadFailure(loadedItemCount) {
  if (Number(loadedItemCount) > 0) {
    return { showRetryCard: false, notice: STOCK_CATALOG_STALE_NOTICE }
  }
  return { showRetryCard: true, notice: '' }
}
