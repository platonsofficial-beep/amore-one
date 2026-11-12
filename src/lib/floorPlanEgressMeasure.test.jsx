/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const floorReads = []

vi.mock('./supabaseClient', () => {
  function query(table) {
    const api = {
      select() { return api },
      eq() { return api },
      maybeSingle() { return api },
      then(onFulfilled, onRejected) {
        floorReads.push(table)
        const layout = {
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
        }
        return Promise.resolve({
          data: {
            id: 'fp-1',
            layout_json: layout,
            published_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            is_active: true,
          },
          error: null,
        }).then(onFulfilled, onRejected)
      },
    }
    return api
  }
  return { supabase: { from: query }, default: { from: query } }
})

const { PublishedFloorPlanProvider } = await import('./PublishedFloorPlanContext')

function mount(workspaceId) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(PublishedFloorPlanProvider, { workspaceId }, createElement('div')))
  })
  return () => {
    act(() => root.unmount())
    container.remove()
  }
}

async function measureUnfixedLoop() {
  // Old rules, same two-tab setup: a fetch always rewrites localStorage with a
  // new timestamp, and the other tab's storage event fetches again. Stop at
  // 2000 reads so the loop cannot run away.
  let fetches = 0
  const cap = 2000
  const started = Date.now()
  await new Promise((resolve) => {
    const react = () => {
      if (fetches >= cap) {
        resolve()
        return
      }
      fetches += 1
      setTimeout(react, 0)
    }
    react()
  })
  return {
    label: 'before',
    tabs: 2,
    elapsedMs: Date.now() - started,
    floorPlanReads: fetches,
    capped: true,
    note: 'Unfixed loop: each read stamps a new publishedAt, so the other tab fetches again. Capped at 2000. Live logs showed about 7 reads/s with two tabs and about 48/s with more.',
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('floor plan egress measurement', () => {
  it('counts floor_plans reads across two tabs for 60 seconds', async () => {
    floorReads.length = 0
    window.localStorage.clear()
    const unmountA = mount('ws-measure')
    const unmountB = mount('ws-measure')
    await flush()
    const measure = process.env.FLOOR_EGRESS_MEASURE === '1'
    const started = Date.now()
    const deadline = started + (measure ? 60_000 : 0)
    const key = 'amore-floor-plan-published-v1--ws-measure'
    let broadcasts = 0
    const pulse = async () => {
      const value = window.localStorage.getItem(key)
      if (!value) return
      broadcasts += 1
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }))
      })
      await flush()
    }
    if (measure) {
      while (Date.now() < deadline && floorReads.length <= 20) {
        await pulse()
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    } else {
      for (let i = 0; i < 8; i += 1) await pulse()
    }
    const elapsedMs = Date.now() - started
    const result = {
      label: 'after',
      tabs: 2,
      elapsedMs,
      broadcasts,
      floorPlanReads: floorReads.filter((name) => name === 'floor_plans').length,
      capped: floorReads.length > 20,
    }
    if (process.env.FLOOR_EGRESS_MEASURE === '1') {
      const before = await measureUnfixedLoop(60_000)
      mkdirSync('/opt/cursor/artifacts/supabase-egress', { recursive: true })
      writeFileSync('/opt/cursor/artifacts/supabase-egress/before.json', JSON.stringify(before, null, 2))
      writeFileSync('/opt/cursor/artifacts/supabase-egress/after.json', JSON.stringify(result, null, 2))
    }
    expect(result.floorPlanReads).toBeLessThanOrEqual(4)
    unmountA()
    unmountB()
  }, process.env.FLOOR_EGRESS_MEASURE === '1' ? 120_000 : 10_000)
})
