import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisibleRefresh, startVisibleInterval } from './visibleInterval'
import { createCoalescedRefresh } from './coalescedRefresh'
import { shouldSkipSameUserReload } from './authReloadPolicy'

function fakeDoc(state = 'visible') {
  const listeners = new Set()
  return {
    visibilityState: state,
    addEventListener: (_e, fn) => listeners.add(fn),
    removeEventListener: (_e, fn) => listeners.delete(fn),
    set(next) { this.visibilityState = next; listeners.forEach((fn) => fn()) },
    count: () => listeners.size,
  }
}

afterEach(() => vi.useRealTimers())

describe('startVisibleInterval', () => {
  it('pauses while hidden and refreshes once when visible again', () => {
    vi.useFakeTimers()
    const doc = fakeDoc(); const cb = vi.fn()
    const stop = startVisibleInterval(cb, 60_000, { doc, win: globalThis })
    vi.advanceTimersByTime(60_000); expect(cb).toHaveBeenCalledTimes(1)
    doc.set('hidden'); vi.advanceTimersByTime(600_000); expect(cb).toHaveBeenCalledTimes(1)
    doc.set('visible'); expect(cb).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000); expect(cb).toHaveBeenCalledTimes(3)
    stop(); vi.advanceTimersByTime(600_000); expect(cb).toHaveBeenCalledTimes(3); expect(doc.count()).toBe(0)
  })
  it('does not start ticking when mounted hidden', () => {
    vi.useFakeTimers()
    const doc = fakeDoc('hidden'); const cb = vi.fn()
    startVisibleInterval(cb, 1000, { doc, win: globalThis })
    vi.advanceTimersByTime(10_000); expect(cb).not.toHaveBeenCalled()
  })
})

describe('createVisibleRefresh', () => {
  it('collapses focus + visibilitychange into one reload and skips hidden', () => {
    let t = 0; const doc = fakeDoc(); const cb = vi.fn()
    const fire = createVisibleRefresh(cb, { doc, now: () => t })
    fire(); fire(); expect(cb).toHaveBeenCalledTimes(1)
    t = 5000; doc.visibilityState = 'hidden'; fire(); expect(cb).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'visible'; fire(); expect(cb).toHaveBeenCalledTimes(2)
  })
})

describe('createCoalescedRefresh', () => {
  it('turns a burst of chat messages into one inbox reload', () => {
    vi.useFakeTimers()
    const doc = fakeDoc(); const cb = vi.fn()
    const c = createCoalescedRefresh(cb, { waitMs: 3000, doc, win: globalThis })
    for (let i = 0; i < 20; i += 1) { c.trigger(); vi.advanceTimersByTime(100) }
    vi.advanceTimersByTime(3000)
    expect(cb).toHaveBeenCalledTimes(1)
    c.cancel()
  })
  it('defers while hidden and reloads once on return', () => {
    vi.useFakeTimers()
    const doc = fakeDoc('hidden'); const cb = vi.fn()
    const c = createCoalescedRefresh(cb, { waitMs: 3000, doc, win: globalThis })
    c.trigger(); c.trigger(); vi.advanceTimersByTime(10_000); expect(cb).not.toHaveBeenCalled()
    doc.set('visible'); expect(cb).toHaveBeenCalledTimes(1)
    c.cancel()
  })
})

describe('shouldSkipSameUserReload', () => {
  it('skips only for the same user with a loaded context', () => {
    expect(shouldSkipSameUserReload({ isSameUser: true, hasLoadedContext: true })).toBe(true)
    expect(shouldSkipSameUserReload({ isSameUser: true, hasLoadedContext: false })).toBe(false)
    expect(shouldSkipSameUserReload({ isSameUser: false, hasLoadedContext: true })).toBe(false)
  })
})
