import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { islandSide } from './islandInsets.js'
import { pinPageX } from './keyboardInset.js'

const win = (orientation, w = 956, h = 440) => ({ innerWidth: w, innerHeight: h, orientation })

describe('islandSide (t404u)', () => {
  it('90 puts the island on the left, -90 / 270 on the right', () => {
    expect(islandSide(win(90))).toBe('left')
    expect(islandSide(win(-90))).toBe('right')
    expect(islandSide({ innerWidth: 956, innerHeight: 440, screen: { orientation: { angle: 270 } } })).toBe('right')
  })
  it('portrait and unknown keep the symmetric fallback', () => {
    expect(islandSide(win(0, 440, 956))).toBe('none')
    expect(islandSide({ innerWidth: 956, innerHeight: 440 })).toBe('none')
  })
})

describe('landscape keyboard never shifts the page sideways', () => {
  it('pinPageX keeps y and resets x', () => {
    const calls = []
    const root = { scrollLeft: 75 }
    expect(pinPageX({ scrollX: 75, scrollY: 30, scrollTo: (...a) => calls.push(a), document: { scrollingElement: root } })).toBe(true)
    expect(calls).toEqual([[0, 30]])
    expect(root.scrollLeft).toBe(0)
  })
  it('CSS: 16px fields on touch/phone, no sideways scroll, island-only inset', () => {
    const css = readFileSync('src/safeOverlay.css', 'utf8')
    expect(css).toMatch(/font-size: 16px !important/)
    expect(css).toMatch(/overflow-x: clip/)
    expect(css).toContain(":root[data-island='left']")
    expect(css).toContain(":root[data-island='right']")
  })
})
