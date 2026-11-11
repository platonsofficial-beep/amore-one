import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readAssignCardViewport } from './assignCardViewport'

function win({ iw, ih, vw, vh, top = 0, left = 0, focused = null }) {
  return {
    innerWidth: iw,
    innerHeight: ih,
    visualViewport: { width: vw, height: vh, offsetTop: top, offsetLeft: left },
    document: {
      activeElement: focused
        ? { closest: (selector) => (selector.includes('assignment-card-filters') ? focused : null) }
        : null,
    },
  }
}

describe('assign card viewport', () => {
  it('uses the visible box with no accessory when Search is not focused', () => {
    expect(readAssignCardViewport(win({
      iw: 1180, ih: 820, vw: 1180, vh: 820,
    }))).toEqual({ top: 0, left: 0, width: 1180, kb: 0, keyboard: false })
  })

  it('keeps a checkbox focus from reserving keyboard space', () => {
    expect(readAssignCardViewport(win({
      iw: 1180, ih: 820, vw: 1180, vh: 500, top: 40,
    }))).toEqual({ top: 40, left: 0, width: 1180, kb: 280, keyboard: false })
  })

  it('clears the iOS accessory when Search is focused and the keyboard is up', () => {
    expect(readAssignCardViewport(win({
      iw: 1180, ih: 820, vw: 1180, vh: 460, top: 0, focused: {},
    }))).toEqual({ top: 0, left: 0, width: 1180, kb: 360 + 44, keyboard: true })
  })

  it('limits the card to the visible width when the layout viewport is wider', () => {
    expect(readAssignCardViewport(win({
      iw: 956, ih: 440, vw: 897, vh: 440, left: 0,
    }))).toMatchObject({ left: 0, width: 897, keyboard: false })
  })

  it('does not treat a rotation as a keyboard', () => {
    expect(readAssignCardViewport(win({
      iw: 820, ih: 1180, vw: 1180, vh: 820, focused: {},
    })).keyboard).toBe(false)
  })

  it('stops iOS landscape text inflation and keeps an 18px far-side gap', () => {
    const index = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
    expect(index).toContain('-webkit-text-size-adjust: 100%')
    expect(index).toContain('text-size-adjust: 100%')
    expect(css).toContain('--assign-far-gap: 18px')
  })
})
