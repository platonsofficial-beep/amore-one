/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockUsageCostReport } from './StockUsageCostReport'

describe('StockUsageCostReport', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
  })

  it('shows used and waste cost, and says when a closing count is missing', async () => {
    const loadSessions = vi.fn(async () => ([
      {
        id: 'open',
        status: 'posted',
        postedAt: '2026-10-01T08:00:00.000Z',
        countTypeLabel: 'Full count',
      },
      {
        id: 'close',
        status: 'posted',
        postedAt: '2026-10-20T08:00:00.000Z',
        countTypeLabel: 'Full count',
      },
    ]))
    const loadLines = vi.fn(async ({ sessionId }) => (
      sessionId === 'open'
        ? [
          { itemId: 'vodka', countedQuantity: 10 },
          { itemId: 'gin', countedQuantity: 4 },
        ]
        : [{ itemId: 'vodka', countedQuantity: 12 }]
    ))
    const loadMovements = vi.fn(async () => ({
      movements: [
        { itemId: 'vodka', type: 'receive', quantity: 6 },
        { itemId: 'vodka', type: 'usage', quantity: 1, note: 'Waste · Expired' },
      ],
      truncated: false,
    }))

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(StockUsageCostReport, {
        workspaceId: 'ws-1',
        items: [
          { id: 'vodka', name: 'Vodka', category: 'Spirits', unit: 'btl', costPrice: 10 },
          { id: 'gin', name: 'Gin', category: 'Spirits', unit: 'btl', costPrice: 8 },
        ],
        onClose: vi.fn(),
        loadSessions,
        loadLines,
        loadMovements,
      }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const vodka = container.querySelector('[data-stock-item-id="vodka"]')
    const gin = container.querySelector('[data-stock-item-id="gin"]')
    expect(vodka?.textContent).toContain('Used')
    expect(vodka?.textContent).toContain('3')
    expect(vodka?.textContent).toContain('€30.00')
    expect(vodka?.textContent).toContain('€10.00')
    expect(gin?.textContent).toContain('No closing count')
    expect(gin?.textContent).toContain('Usage cost')
    expect(gin?.textContent).toContain('—')
    expect(container.querySelector('[data-testid="stock-usage-report-summary"]')?.textContent)
      .toContain('1 missing a count')
  })

  it('asks for two posted counts instead of showing zeros', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(StockUsageCostReport, {
        workspaceId: 'ws-1',
        items: [],
        onClose: vi.fn(),
        loadSessions: async () => ([
          { id: 'only', status: 'posted', postedAt: '2026-10-01T08:00:00.000Z', countTypeLabel: 'Full count' },
        ]),
        loadLines: async () => [],
        loadMovements: async () => ({ movements: [], truncated: false }),
      }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Post two inventory counts')
    expect(container.querySelector('[data-testid="stock-usage-report-summary"]')).toBeNull()
  })
})
