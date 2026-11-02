import { describe, expect, it } from 'vitest'
import { keyboardOverlap, keepChatPinned, revealFocusedSheetField } from './keyboardInset'
import { clampOverlayLeft } from './safeInline'

describe('keyboardOverlap', () => {
  it('treats a shorter visual viewport as the keyboard', () => {
    expect(keyboardOverlap({ height: 500, offsetTop: 0 }, 844)).toEqual({
      kb: 344,
      vvh: 500,
      top: 0,
    })
  })

  it('subtracts a scrolled visual viewport offset', () => {
    expect(keyboardOverlap({ height: 520, offsetTop: 40 }, 844)).toEqual({
      kb: 284,
      vvh: 520,
      top: 40,
    })
  })

  it('stays at zero when the visual viewport fills the layout viewport', () => {
    expect(keyboardOverlap({ height: 844, offsetTop: 0 }, 844).kb).toBe(0)
  })

  it('falls back to the layout height without a visual viewport', () => {
    expect(keyboardOverlap(null, 844)).toEqual({ kb: 0, vvh: 844, top: 0 })
  })

  it('pins a stuck chat after the viewport moves, and leaves history alone', () => {
    const pins = []
    const node = {
      dataset: { chatStick: '1' },
      scrollHeight: 2000,
      scrollTop: 400,
    }
    const win = {
      document: { querySelector: () => node },
      scrollTo: () => pins.push('window'),
      requestAnimationFrame: (fn) => { fn(); return 1 },
      setTimeout: (fn) => { fn(); return 2 },
      clearTimeout() {},
      cancelAnimationFrame() {},
    }
    keepChatPinned(win)
    expect(node.scrollTop).toBe(2000)
    expect(pins.length).toBeGreaterThan(0)
    expect(node.dataset.chatHold).toBeUndefined()

    node.dataset = { chatStick: '0' }
    node.scrollTop = 100
    keepChatPinned(win)
    expect(node.scrollTop).toBe(100)
  })

  it('does not touch the page scroll outside a pinned chat', () => {
    const pins = []
    const win = { document: { querySelector: () => null }, scrollTo: () => pins.push('window') }
    expect(keepChatPinned(win)).toBeUndefined()
    expect(pins).toEqual([])
  })

  it('centres the focused field of a bottom sheet', () => {
    const calls = []
    const field = {
      matches: () => true,
      closest: (sel) => (sel === '.chat-composer' ? null : {}),
      scrollIntoView: (opts) => calls.push(opts),
    }
    expect(revealFocusedSheetField({ document: { activeElement: field } })).toBe(true)
    expect(calls[0]).toMatchObject({ block: 'center' })
    expect(revealFocusedSheetField({ document: { activeElement: { matches: () => false } } })).toBe(false)
  })
})

describe('clampOverlayLeft', () => {
  it('keeps a menu inside an explicit minimum when no safe var is set', () => {
    expect(clampOverlayLeft(0, 180, 390, 12)).toBe(12)
    expect(clampOverlayLeft(400, 180, 390, 12)).toBe(198)
  })
})
