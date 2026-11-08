/**
 * @vitest-environment jsdom
 */
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PUBLISHED_LAYOUT_EVENT } from '../floor-plan-builder/lib/floorPlanStorage'

const floorReads = []

vi.mock('./supabaseClient', () => {
  function query(table) {
    const api = {
      select() { return api },
      eq() { return api },
      order() { return api },
      maybeSingle() { return api },
      then(onFulfilled, onRejected) {
        floorReads.push(table)
        if (floorReads.length > 25) {
          return Promise.resolve({ data: null, error: { message: 'stopped' } }).then(onFulfilled, onRejected)
        }
        const layout = {
          version: 1,
          floors: globalThis.__floorEmpty
            ? []
            : [{ id: 'main', label: 'Main', workspace: { width: 1000, height: 700, x: 0, y: 0 } }],
          activeFloorId: 'main',
          objects: [{
            id: 't1',
            type: 'table',
            floorId: 'main',
            position: { x: 100, y: 100 },
            size: { width: 80, height: 80 },
            properties: { shape: 'round', tableNumber: '1', minGuests: 1, maxGuests: 4, visible: true },
          }],
        }
        const result = floorReads.filter((name) => name === 'floor_plans').length === 1
          && globalThis.__floorFailOnce
          ? { data: null, error: { message: 'Failed to fetch' } }
          : {
            data: {
              id: 'fp-1',
              layout_json: layout,
              draft_layout_json: layout,
              published_at: '2026-01-01T00:00:00.000Z',
              is_active: true,
            },
            error: null,
          }
        return Promise.resolve(result).then(onFulfilled, onRejected)
      },
    }
    return api
  }

  return {
    supabase: { from: query },
    default: { from: query },
  }
})

const { PublishedFloorPlanProvider, usePublishedFloorPlan } = await import('./PublishedFloorPlanContext')

function Probe() {
  const { isLoading, loadError, hasDisplayableLayout } = usePublishedFloorPlan()
  return createElement('p', {
    'data-loading': isLoading ? 'yes' : 'no',
    'data-error': loadError || '',
    'data-layout': hasDisplayableLayout ? 'yes' : 'no',
  })
}

function Harness({ workspaceId = 'ws-1' }) {
  const [tick, setTick] = useState(0)
  return createElement('div', null,
    createElement('button', { type: 'button', onClick: () => setTick((value) => value + 1) }, String(tick)),
    createElement(PublishedFloorPlanProvider, { workspaceId }, createElement(Probe)),
  )
}

function renderHarness(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Harness, props))
  })
  return {
    container,
    rerender(nextProps) {
      act(() => {
        root.render(createElement(Harness, nextProps))
      })
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('floor plan load does not retrigger itself', () => {
  afterEach(() => {
    floorReads.length = 0
    globalThis.__floorFailOnce = false
    globalThis.__floorEmpty = false
    window.localStorage.clear()
  })

  it('reads floor_plans once for a stable workspace, including after parent rerenders', async () => {
    const view = renderHarness()
    await flush()
    const button = view.container.querySelector('button')
    act(() => button.click())
    act(() => button.click())
    await flush()

    expect(floorReads.filter((name) => name === 'floor_plans')).toHaveLength(1)
    expect(view.container.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('yes')
    view.unmount()
  })

  it('does not schedule another floor_plans read when the first response fails', async () => {
    globalThis.__floorFailOnce = true
    const view = renderHarness({ workspaceId: 'ws-fail' })
    await flush()
    await flush()

    expect(floorReads.filter((name) => name === 'floor_plans')).toHaveLength(1)
    expect(view.container.querySelector('[data-error]')?.getAttribute('data-error')).toBeTruthy()
    expect(view.container.querySelector('[data-loading]')?.getAttribute('data-loading')).toBe('no')
    view.unmount()
  })

  it('does not start a second read when the cache write announces the layout just loaded', async () => {
    const view = renderHarness({ workspaceId: 'ws-event' })
    await flush()
    const before = floorReads.filter((name) => name === 'floor_plans').length
    act(() => {
      window.dispatchEvent(new CustomEvent(PUBLISHED_LAYOUT_EVENT, {
        detail: {
          version: 1,
          floors: [{ id: 'main', label: 'Main', workspace: { width: 1000, height: 700, x: 0, y: 0 } }],
          activeFloorId: 'main',
          objects: [{
            id: 't1',
            type: 'table',
            floorId: 'main',
            position: { x: 100, y: 100 },
            size: { width: 80, height: 80 },
            properties: { shape: 'round', tableNumber: '1', minGuests: 1, maxGuests: 4, visible: true },
          }],
        },
      }))
    })
    await flush()

    expect(floorReads.filter((name) => name === 'floor_plans').length).toBe(before)
    view.unmount()
  })

  it('does not refetch when the saved layout has no floors', async () => {
    globalThis.__floorEmpty = true
    const view = renderHarness({ workspaceId: 'ws-empty' })
    await flush()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    expect(floorReads.filter((name) => name === 'floor_plans').length).toBeLessThanOrEqual(1)
    view.unmount()
  })

  it('starts one new read when the workspace id changes, not one per rerender', async () => {
    const view = renderHarness({ workspaceId: 'ws-a' })
    await flush()
    view.rerender({ workspaceId: 'ws-a' })
    await flush()
    view.rerender({ workspaceId: 'ws-b' })
    await flush()

    expect(floorReads.filter((name) => name === 'floor_plans')).toHaveLength(2)
    view.unmount()
  })
})
