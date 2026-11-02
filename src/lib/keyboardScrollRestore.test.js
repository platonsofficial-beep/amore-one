import { describe, expect, it, vi } from 'vitest'
import { restorePageScroll } from './keyboardInset.js'

function fakeWin({ x = 0, y = 0, active = null } = {}) {
  const root = { scrollLeft: x, scrollTop: y }
  return {
    scrollX: x,
    scrollY: y,
    scrollTo: vi.fn(),
    document: { activeElement: active, scrollingElement: root, querySelectorAll: () => [] },
    root,
  }
}

describe('restorePageScroll (t398u)', () => {
  it('puts a page that iOS left shifted after the keyboard back at 0,0', () => {
    const win = fakeWin({ x: 70, y: 30 })
    expect(restorePageScroll(win)).toBe(true)
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(win.root.scrollLeft).toBe(0)
    expect(win.root.scrollTop).toBe(0)
  })
  it('does nothing while a field still has focus', () => {
    const win = fakeWin({ x: 70, y: 30, active: { matches: () => true } })
    expect(restorePageScroll(win)).toBe(false)
    expect(win.scrollTo).not.toHaveBeenCalled()
  })
  it('does nothing when the page is not shifted', () => {
    const win = fakeWin()
    expect(restorePageScroll(win)).toBe(false)
  })
})
