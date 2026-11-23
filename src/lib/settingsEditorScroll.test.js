/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { insetsForOverlays, revealInView, scrollDeltaForReveal } from './settingsEditorScroll'

describe('settings editor scroll', () => {
  it('clears a card that sits under the top banner', () => {
    const delta = scrollDeltaForReveal({
      elementBox: { top: 20, bottom: 220, height: 200 },
      portBox: { top: 0, bottom: 700 },
      insets: { top: 88, bottom: 96 },
    })
    expect(delta).toBe(20 - 88)
  })

  it('lifts a card that is covered by the bottom nav', () => {
    const delta = scrollDeltaForReveal({
      elementBox: { top: 520, bottom: 720, height: 200 },
      portBox: { top: 0, bottom: 700 },
      insets: { top: 88, bottom: 96 },
    })
    expect(delta).toBe(720 - (700 - 96))
  })

  it('leaves a card that is already fully visible', () => {
    const delta = scrollDeltaForReveal({
      elementBox: { top: 120, bottom: 320, height: 200 },
      portBox: { top: 0, bottom: 700 },
      insets: { top: 88, bottom: 96 },
    })
    expect(delta).toBe(0)
  })

  it('pins the top of a card that is taller than the open space', () => {
    const delta = scrollDeltaForReveal({
      elementBox: { top: 400, bottom: 1400, height: 1000 },
      portBox: { top: 0, bottom: 700 },
      insets: { top: 80, bottom: 90 },
    })
    expect(delta).toBe(400 - 80)
  })

  it('counts the trial banner above the fold and the nav below it', () => {
    const insets = insetsForOverlays(
      { top: 0, bottom: 800 },
      [
        { top: 0, bottom: 72, height: 72, width: 390 },
        { top: 720, bottom: 800, height: 80, width: 390 },
      ],
    )
    expect(insets.top).toBe(84)
    expect(insets.bottom).toBe(92)
  })

  it('smoothly scrolls the page owner so the card clears the trial banner', () => {
    const scroller = document.createElement('div')
    const card = document.createElement('div')
    scroller.appendChild(card)
    document.body.appendChild(scroller)
    scroller.style.overflowY = 'auto'
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 })
    scroller.scrollTop = 500
    scroller.scrollTo = vi.fn()
    scroller.getBoundingClientRect = () => ({ top: 80, bottom: 480, left: 0, right: 390, height: 400, width: 390 })
    card.getBoundingClientRect = () => ({ top: 40, bottom: 240, left: 0, right: 390, height: 200, width: 390 })
    const banner = document.createElement('div')
    banner.className = 'subscription-banner'
    banner.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 390, height: 100, width: 390 })
    document.body.appendChild(banner)

    revealInView(card)

    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 428, behavior: 'smooth' })
    banner.remove()
    scroller.remove()
  })
})
