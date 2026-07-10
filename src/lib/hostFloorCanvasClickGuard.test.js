import { describe, expect, it, vi } from 'vitest'
import { shouldIgnoreCanvasDismissForScheduleCard } from './hostScheduleCardLifecycle'

describe('host floor canvas click guard', () => {
  it('does not dismiss the table day view while tap suppression is active', () => {
    const dismissFloorTooltips = vi.fn()

    const handleCanvasClick = ({
      suppressTableClick = false,
      hasScheduleCardTable = false,
    } = {}) => {
      if (shouldIgnoreCanvasDismissForScheduleCard({
        suppressTableClick,
        hasScheduleCardTable,
      })) {
        return
      }
      dismissFloorTooltips()
    }

    handleCanvasClick({ suppressTableClick: true })
    expect(dismissFloorTooltips).not.toHaveBeenCalled()

    handleCanvasClick({ hasScheduleCardTable: true })
    expect(dismissFloorTooltips).not.toHaveBeenCalled()

    handleCanvasClick()
    expect(dismissFloorTooltips).toHaveBeenCalledTimes(1)
  })
})
