/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container
let root
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve() }) }
const render = async (el) => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); await act(async () => { root.render(el) }); await flush() }
const findText = (re) => [...document.querySelectorAll('button, strong, p, small, span')].find((n) => (typeof re === 'string' ? n.textContent.trim() === re : re.test(n.textContent)))
const byLabel = (re) => [...document.querySelectorAll('[aria-label]')].find((n) => re instanceof RegExp ? re.test(n.getAttribute('aria-label')) : n.getAttribute('aria-label') === re)
const click = async (node) => { await act(async () => { (node.closest('button') ?? node).click() }); await flush() }
const screen = {
  findByText: async (t) => { await flush(); const n = findText(t); if (!n) throw new Error('not found ' + t); return n },
  getByText: (t) => { const n = findText(t); if (!n) throw new Error('not found ' + t); return n },
  queryByText: (t) => findText(t) ?? null,
  getByLabelText: (t) => byLabel(t),
}
const fireEvent = {
  click: (n) => click(n),
  change: async (n, { target: { value } }) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => { setter.call(n, value); n.dispatchEvent(new Event('input', { bubbles: true })) })
  },
}
const waitFor = async (fn) => { await flush(); fn() }

const take = vi.fn()
const undo = vi.fn()
const rpc = vi.fn(async () => ({ data: null, error: null }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))
vi.mock('../../services/stockStorageCenterService', () => ({
  getWorkspaceStorageSummaries: vi.fn(async () => ({ storages: [{ id: 'st1', name: 'Water storage', productCount: 1, isSupply: true }, { id: 'st2', name: 'Bar shelf', productCount: 1, isSupply: false }] })),
  getWorkspaceStorageProducts: vi.fn(async () => ({ products: [{ stockItemId: 'w1', name: 'Water 1.5L', category: 'Still water', unit: 'Bottle', quantity: 48, active: true, costPrice: 9, item: {} }] })),
}))
vi.mock('../../services/stockQuickTakeService', async (orig) => {
  const real = await orig()
  return { ...real, takeStockFromStorage: (...a) => take(...a), undoQuickTake: (...a) => undo(...a) }
})
const { StockQuickTakeView } = await import('./StockQuickTakeView')
const items = [{ id: 'w1', packUnit: 'Case', unitsPerPack: 6 }]

describe('StockQuickTakeView', () => {
  afterEach(() => { act(() => root?.unmount()); container?.remove() })
  beforeEach(() => { take.mockReset(); undo.mockReset(); rpc.mockClear(); localStorage.clear() })

  it('takes 5 cases as 30 bottles and offers Undo', async () => {
    take.mockResolvedValue({ movementId: 'mv1', quantityAfter: 18 })
    undo.mockResolvedValue({ quantityAfter: 48 })
    await render(createElement(StockQuickTakeView, { workspaceId: 'ws', stockItems: items }))
    await fireEvent.click(await screen.findByText('Water storage'))
    await fireEvent.click(await screen.findByText('Still water'))
    await fireEvent.click(await screen.findByText('Water 1.5L'))
    for (let i = 0; i < 4; i += 1) await fireEvent.click(screen.getByLabelText("One more"))
    expect(screen.getByText(/5 Cases = 30 Bottles/)).toBeTruthy()
    expect(screen.queryByText(/€/)).toBeNull()
    await fireEvent.click(screen.getByText('Done'))
    await waitFor(() => expect(take).toHaveBeenCalledWith(expect.objectContaining({ quantity: 30, storageId: 'st1', stockItemId: 'w1' })))
    expect(await screen.findByText(/Took 5 Cases/)).toBeTruthy()
    await fireEvent.click(screen.getByText('Undo'))
    await waitFor(() => expect(undo).toHaveBeenCalledWith('mv1'))
  })

  it('warns but allows taking more than stock', async () => {
    await render(createElement(StockQuickTakeView, { workspaceId: 'ws', stockItems: items }))
    await fireEvent.click(await screen.findByText('Water storage'))
    await fireEvent.click(await screen.findByText('Still water'))
    await fireEvent.click(await screen.findByText('Water 1.5L'))
    await fireEvent.change(screen.getByLabelText(/Quantity in/), { target: { value: '10' } })
    expect(screen.getByText(/Stock shows only 48 Bottles/)).toBeTruthy()
    expect(screen.getByText('Done').closest('button').disabled).toBe(false)
  })

  it('calls no RPC when the Take screen opens', async () => {
    await render(createElement(StockQuickTakeView, { workspaceId: 'ws', stockItems: items }))
    expect(await screen.findByText('Water storage')).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
  })

  it('shows a clear message when a real take finds the server feature missing', async () => {
    const { QuickTakeUnavailableError } = await import('../../services/stockQuickTakeService')
    take.mockRejectedValue(new QuickTakeUnavailableError())
    await render(createElement(StockQuickTakeView, { workspaceId: 'ws', stockItems: items }))
    await fireEvent.click(await screen.findByText('Water storage'))
    await fireEvent.click(await screen.findByText('Still water'))
    await fireEvent.click(await screen.findByText('Water 1.5L'))
    await fireEvent.click(screen.getByText('Done'))
    expect(await screen.findByText(/not switched on yet/)).toBeTruthy()
  })

  it('lists only supply storages', async () => {
    await render(createElement(StockQuickTakeView, { workspaceId: 'ws', stockItems: items }))
    expect(await screen.findByText('Water storage')).toBeTruthy()
    expect(screen.queryByText('Bar shelf')).toBeNull()
  })

  it('tells a manager where to mark supply storages when there are none', async () => {
    const svc = await import('../../services/stockStorageCenterService')
    svc.getWorkspaceStorageSummaries.mockResolvedValueOnce({ storages: [{ id: 'st2', name: 'Bar shelf', isSupply: false }] })
    await render(createElement(StockQuickTakeView, { workspaceId: 'ws', stockItems: items, canManage: true }))
    expect(await screen.findByText(/No supply storages yet/)).toBeTruthy()
    expect(screen.getByText(/Storages → Edit → Mark as supply/)).toBeTruthy()
  })
})
