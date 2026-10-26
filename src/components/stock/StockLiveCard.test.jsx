/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { StockLiveCard } from './StockLiveCard'

function render(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('StockLiveCard', () => {
  it('opens below par, drafts, and counts from the three rows', () => {
    const onOpenBelowPar = vi.fn()
    const onOpenDrafts = vi.fn()
    const onOpenCounts = vi.fn()
    const { container, cleanup } = render(createElement(StockLiveCard, {
      belowParCount: 1,
      parsReady: true,
      parsStatus: 'ready',
      stockOrders: [{ status: 'draft' }],
      stockItems: [{ id: 'cola', active: true, lastCount: { createdAt: '2026-10-26T08:00:00.000Z' } }],
      now: new Date('2026-10-26T12:00:00.000Z'),
      onOpenBelowPar,
      onOpenDrafts,
      onOpenCounts,
    }))

    const rows = Array.from(container.querySelectorAll('button'))
    expect(rows.map((row) => row.textContent)).toEqual([
      '1 item below par›',
      '1 open draft›',
      'Last count today›',
    ])
    rows.forEach((row) => {
      expect(row.className).toContain('stock-live-card-row')
    })

    act(() => { rows[0].click() })
    act(() => { rows[1].click() })
    act(() => { rows[2].click() })
    expect(onOpenBelowPar).toHaveBeenCalledTimes(1)
    expect(onOpenDrafts).toHaveBeenCalledTimes(1)
    expect(onOpenCounts).toHaveBeenCalledTimes(1)

    cleanup()
  })
})
