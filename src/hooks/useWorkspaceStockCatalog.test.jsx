/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useWorkspaceStockCatalog } from './useWorkspaceStockCatalog'

function HookProbe({ workspaceId, enabled, loadItems, onState }) {
  const state = useWorkspaceStockCatalog({ workspaceId, enabled, loadItems })
  onState(state)
  return createElement(
    'div',
    {
      'data-status': state.status,
      'data-count': String(state.productCount),
      'data-error': state.errorMessage,
    },
    state.status,
  )
}

describe('useWorkspaceStockCatalog', () => {
  let container
  let root
  /** @type {object[]} */
  let states

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
    states = []
    vi.restoreAllMocks()
  })

  function renderHook(props) {
    states = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(HookProbe, {
        ...props,
        onState: (state) => {
          states.push(state)
        },
      }))
    })
  }

  function latest() {
    return states[states.length - 1]
  }

  it('stays idle when disabled', () => {
    const loadItems = vi.fn()
    renderHook({
      workspaceId: 'ws-1',
      enabled: false,
      loadItems,
    })

    expect(latest().status).toBe('idle')
    expect(loadItems).not.toHaveBeenCalled()
  })

  it('shows loading then success with product count', async () => {
    let resolveLoad
    const loadItems = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve
    }))

    renderHook({
      workspaceId: 'ws-1',
      enabled: true,
      loadItems,
    })

    expect(latest().status).toBe('loading')
    expect(loadItems).toHaveBeenCalledWith('ws-1')

    await act(async () => {
      resolveLoad([
        { id: '1', name: 'Belvedere', category: 'Vodka', unit: 'Bottle', sku: null, active: true },
        { id: '2', name: 'Tanqueray', category: 'Gin', unit: 'Bottle', sku: null, active: false },
      ])
      await Promise.resolve()
    })

    expect(latest().status).toBe('success')
    expect(latest().productCount).toBe(2)
    expect(latest().errorMessage).toBe('')
  })

  it('supports an empty successful catalog', async () => {
    const loadItems = vi.fn(async () => [])

    renderHook({
      workspaceId: 'ws-empty',
      enabled: true,
      loadItems,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latest().status).toBe('success')
    expect(latest().productCount).toBe(0)
    expect(latest().items).toEqual([])
  })

  it('surfaces a premium-safe error state without throwing', async () => {
    const loadItems = vi.fn(async () => {
      throw new Error('network down')
    })

    renderHook({
      workspaceId: 'ws-1',
      enabled: true,
      loadItems,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latest().status).toBe('error')
    expect(latest().errorMessage).toBe('network down')
    expect(latest().items).toEqual([])
  })

  it('reloads when workspace id changes (workspace isolation)', async () => {
    const loadItems = vi.fn(async (workspaceId) => [
      { id: workspaceId, name: workspaceId, category: null, unit: '', sku: null, active: true },
    ])

    renderHook({
      workspaceId: 'ws-a',
      enabled: true,
      loadItems,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(latest().items[0].id).toBe('ws-a')

    act(() => {
      root.render(createElement(HookProbe, {
        workspaceId: 'ws-b',
        enabled: true,
        loadItems,
        onState: (state) => {
          states.push(state)
        },
      }))
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadItems.mock.calls.map((call) => call[0])).toEqual(['ws-a', 'ws-b'])
    expect(latest().items[0].id).toBe('ws-b')
  })
})
