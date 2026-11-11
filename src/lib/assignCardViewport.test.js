import { describe, expect, it } from 'vitest'
import { readAssignCardViewport } from './assignCardViewport'

function win({ iw, ih, vw, vh, top = 0, focused = null }) {
  return {
    innerWidth: iw,
    innerHeight: ih,
    visualViewport: { width: vw, height: vh, offsetTop: top },
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
    }))).toEqual({ top: 0, kb: 0, keyboard: false })
  })

  it('keeps a checkbox focus from reserving keyboard space', () => {
    expect(readAssignCardViewport(win({
      iw: 1180, ih: 820, vw: 1180, vh: 500, top: 40,
    }))).toEqual({ top: 40, kb: 280, keyboard: false })
  })

  it('clears the iOS accessory when Search is focused and the keyboard is up', () => {
    expect(readAssignCardViewport(win({
      iw: 1180, ih: 820, vw: 1180, vh: 460, top: 0, focused: {},
    }))).toEqual({ top: 0, kb: 360 + 44, keyboard: true })
  })

  it('does not treat a rotation as a keyboard', () => {
    expect(readAssignCardViewport(win({
      iw: 820, ih: 1180, vw: 1180, vh: 820, focused: {},
    })).keyboard).toBe(false)
  })
})
