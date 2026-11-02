import { describe, expect, it } from 'vitest'
import { isSoftKeyboardShrink, readLiveViewportBox } from './viewportUtils'
import { readPortraitOrientation } from './managerLandscape'

function fakeWin({ iw, ih, vw, vh, focused = 'input', landscapeQuery = false }) {
  return {
    innerWidth: iw,
    innerHeight: ih,
    visualViewport: { width: vw, height: vh },
    document: { activeElement: focused ? { tagName: focused } : null },
    matchMedia: (q) => ({ matches: q.includes('landscape') ? landscapeQuery : !landscapeQuery }),
  }
}

describe('iOS keyboard does not count as rotation', () => {
  it('keeps portrait when the keyboard shrinks only the visual height', () => {
    const win = fakeWin({ iw: 393, ih: 659, vw: 393, vh: 297 })
    expect(isSoftKeyboardShrink(win)).toBe(true)
    expect(readLiveViewportBox(win)).toEqual({ width: 393, height: 659 })
    expect(readPortraitOrientation(win)).toBe(true)
  })

  it('still reports landscape on a real rotation', () => {
    const win = fakeWin({ iw: 659, ih: 393, vw: 659, vh: 393, focused: null, landscapeQuery: true })
    expect(isSoftKeyboardShrink(win)).toBe(false)
    const box = readLiveViewportBox(win)
    expect(box.width).toBeGreaterThan(box.height)
    expect(readPortraitOrientation(win)).toBe(false)
  })

  it('keeps landscape when the keyboard opens in landscape', () => {
    const win = fakeWin({ iw: 667, ih: 375, vw: 667, vh: 175, landscapeQuery: true })
    expect(isSoftKeyboardShrink(win)).toBe(true)
    expect(readLiveViewportBox(win)).toEqual({ width: 667, height: 375 })
  })

  it('ignores a short visual viewport when no field is focused', () => {
    const win = fakeWin({ iw: 393, ih: 659, vw: 393, vh: 297, focused: null })
    expect(isSoftKeyboardShrink(win)).toBe(false)
  })
})
