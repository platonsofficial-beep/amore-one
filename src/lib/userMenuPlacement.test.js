import { describe, expect, it } from 'vitest'
import { placeUserMenuPanel } from './userMenuPlacement'

describe('placeUserMenuPanel', () => {
  it('opens below a top trigger and keeps Logout inside the short viewport', () => {
    const placed = placeUserMenuPanel(
      { top: 48, bottom: 92, left: 776, right: 820 },
      { width: 844, height: 390 },
    )

    expect(placed.placement).toBe('below')
    expect(placed.top).toBe(100)
    expect(placed.left).toBe(500)
    expect(placed.width).toBe(320)
    expect(placed.maxHeight).toBe(282)
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(390 - 8)
  })

  it('flips above the trigger when the header leaves no room below', () => {
    const placed = placeUserMenuPanel(
      { top: 316, bottom: 360, left: 776, right: 820 },
      { width: 844, height: 390, safeTop: 0, safeBottom: 0 },
    )

    expect(placed.placement).toBe('above')
    expect(placed.maxHeight).toBe(300)
    expect(placed.top).toBe(8)
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(316)
  })

  it('clamps to the viewport and safe-area margins', () => {
    const placed = placeUserMenuPanel(
      { top: 40, bottom: 84, left: 0, right: 48 },
      { width: 200, height: 390, safeTop: 12, safeBottom: 20 },
    )

    expect(placed.left).toBe(8)
    expect(placed.width).toBe(184)
    expect(placed.top).toBeGreaterThanOrEqual(8 + 12)
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(390 - 8 - 20)
    expect(placed.maxHeight).toBeLessThanOrEqual(390 - 16 - 12 - 20)
  })
})
