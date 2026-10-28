import { describe, expect, it } from 'vitest'
import { keyboardOverlap } from './keyboardInset'
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
})

describe('clampOverlayLeft', () => {
  it('keeps a menu inside an explicit minimum when no safe var is set', () => {
    expect(clampOverlayLeft(0, 180, 390, 12)).toBe(12)
    expect(clampOverlayLeft(400, 180, 390, 12)).toBe(198)
  })
})
