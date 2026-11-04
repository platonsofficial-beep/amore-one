import { describe, expect, it } from 'vitest'
import { resolveStockCatalogLoadFailure, STOCK_CATALOG_STALE_NOTICE } from './stockCatalogLoadFailure'

describe('resolveStockCatalogLoadFailure (S-01/S-11)', () => {
  it('shows the Retry card when nothing has loaded yet', () => {
    expect(resolveStockCatalogLoadFailure(0)).toEqual({ showRetryCard: true, notice: '' })
    expect(resolveStockCatalogLoadFailure(undefined)).toEqual({ showRetryCard: true, notice: '' })
  })
  it('keeps the loaded list and shows a stale notice when items are already on screen', () => {
    expect(resolveStockCatalogLoadFailure(26)).toEqual({ showRetryCard: false, notice: STOCK_CATALOG_STALE_NOTICE })
  })
})
