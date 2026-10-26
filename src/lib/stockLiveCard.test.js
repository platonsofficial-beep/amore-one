import { describe, expect, it } from 'vitest'
import {
  buildStockLiveFacts,
  countWorkspaceItemsBelowPar,
  formatLastCountFact,
  latestStockCountAt,
} from './stockLiveCard'

describe('stock live card', () => {
  it('counts shelf lines that are under par', () => {
    expect(countWorkspaceItemsBelowPar({
      pars: [
        { workspace_storage_id: 'cellar', stock_item_id: 'cola', par_quantity: 6 },
        { workspace_storage_id: 'bar', stock_item_id: 'cola', par_quantity: 2 },
        { workspace_storage_id: 'bar', stock_item_id: 'tonic', par_quantity: 4 },
      ],
      balances: [
        { workspace_storage_id: 'cellar', stock_item_id: 'cola', quantity: 6 },
        { workspace_storage_id: 'bar', stock_item_id: 'cola', quantity: 1 },
      ],
    })).toBe(2)
  })

  it('uses the newest active product count', () => {
    const latest = latestStockCountAt([
      { id: 'old', active: true, lastCount: { createdAt: '2026-10-01T10:00:00.000Z' } },
      { id: 'gone', active: false, lastCount: { createdAt: '2026-10-26T10:00:00.000Z' } },
      { id: 'new', active: true, lastCount: { created_at: '2026-10-20T10:00:00.000Z' } },
    ])
    expect(latest).toBe('2026-10-20T10:00:00.000Z')
    expect(formatLastCountFact(null)).toBe('No counts yet')
    expect(formatLastCountFact('2026-10-26T08:00:00.000Z', new Date('2026-10-26T18:00:00.000Z'))).toBe('Last count today')
  })

  it('builds the three live facts', () => {
    const facts = buildStockLiveFacts({
      belowParCount: 2,
      parsReady: true,
      orders: [{ status: 'draft' }, { status: 'sent' }, { status: 'draft' }],
      items: [{ id: 'cola', active: true, lastCount: { createdAt: '2026-10-25T10:00:00.000Z' } }],
      now: new Date('2026-10-26T10:00:00.000Z'),
    })

    expect(facts.belowParLabel).toBe('2 items below par')
    expect(facts.belowParTone).toBe('warning')
    expect(facts.draftLabel).toBe('2 open drafts')
    expect(facts.draftTone).toBe('warning')
    expect(facts.lastCountLabel).toBe('Last count 1 day ago')
  })

  it('keeps drafts and counts visible when pars are not in the database', () => {
    const facts = buildStockLiveFacts({
      parsReady: false,
      orders: [],
      items: [],
    })
    expect(facts.belowParLabel).toBe('Pars not available yet')
    expect(facts.draftLabel).toBe('0 open drafts')
    expect(facts.lastCountLabel).toBe('No counts yet')
  })
})
