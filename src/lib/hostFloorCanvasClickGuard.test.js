import { describe, expect, it, vi } from 'vitest'

describe('host floor canvas click guard', () => {
  it('does not dismiss the table day view while tap suppression is active', () => {
    const suppressTableClickRef = { current: true }
    const dismissFloorTooltips = vi.fn()

    const handleCanvasClick = () => {
      if (suppressTableClickRef.current) return
      dismissFloorTooltips()
    }

    handleCanvasClick()
    expect(dismissFloorTooltips).not.toHaveBeenCalled()

    suppressTableClickRef.current = false
    handleCanvasClick()
    expect(dismissFloorTooltips).toHaveBeenCalledTimes(1)
  })
})
