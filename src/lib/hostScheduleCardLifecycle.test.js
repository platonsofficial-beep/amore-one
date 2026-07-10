import { describe, expect, it, vi } from 'vitest'
import {
  buildHostFloorContextSnapshot,
  createHostScheduleCardLifecycleState,
  getScheduleCardOpenDurationMs,
  recordScheduleCardDismiss,
  recordScheduleCardOpen,
  resolveScheduleCardTableById,
  shouldCloseScheduleCardForFloorContextChange,
  shouldIgnoreCanvasDismissForScheduleCard,
} from './hostScheduleCardLifecycle'

describe('hostScheduleCardLifecycle', () => {
  it('keeps table day view open after table tap lifecycle open', () => {
    let lifecycle = createHostScheduleCardLifecycleState()
    lifecycle = recordScheduleCardOpen(lifecycle, { tableId: 't10', tableLabel: 'T10' })

    expect(lifecycle.openedTableLabel).toBe('T10')
    expect(lifecycle.lastDismissSource).toBe('none')
    expect(getScheduleCardOpenDurationMs({ ...lifecycle, openedAt: 1000 }, 1500)).toBe(500)
  })

  it('ignores delayed canvas click while suppression or dialog is active', () => {
    expect(shouldIgnoreCanvasDismissForScheduleCard({ suppressTableClick: true })).toBe(true)
    expect(shouldIgnoreCanvasDismissForScheduleCard({ hasScheduleCardTable: true })).toBe(true)
    expect(shouldIgnoreCanvasDismissForScheduleCard({
      suppressTableClick: false,
      hasScheduleCardTable: true,
    })).toBe(true)
  })

  it('resolves schedule card table by stable id after floor rerender', () => {
    const table = resolveScheduleCardTableById('t10', {
      layoutTables: [{ id: 't10', label: 'T10' }],
      visibleTableStates: [{ table: { id: 't10', label: 'T10' } }],
    })

    expect(table?.label).toBe('T10')
  })

  it('does not close on identical floor context snapshots', () => {
    const snapshot = buildHostFloorContextSnapshot({
      areaId: 'main',
      layoutId: 'layout-1',
      publishedAt: '2026-07-10',
    })

    expect(shouldCloseScheduleCardForFloorContextChange({
      previous: snapshot,
      next: snapshot,
    })).toBe(false)
  })

  it('closes only when floor area or published layout changes', () => {
    const previous = buildHostFloorContextSnapshot({
      areaId: 'main',
      layoutId: 'layout-1',
      publishedAt: '2026-07-10',
    })

    expect(shouldCloseScheduleCardForFloorContextChange({
      previous,
      next: buildHostFloorContextSnapshot({ ...previous, areaId: 'patio' }),
    })).toBe(true)

    expect(shouldCloseScheduleCardForFloorContextChange({
      previous,
      next: buildHostFloorContextSnapshot({ ...previous, publishedAt: '2026-07-11' }),
    })).toBe(true)
  })

  it('records explicit dismiss sources', () => {
    const lifecycle = recordScheduleCardDismiss(
      recordScheduleCardOpen(createHostScheduleCardLifecycleState(), { tableId: 't10', tableLabel: 'T10' }),
      'dialog-close',
    )

    expect(lifecycle.lastDismissSource).toBe('dialog-close')
    expect(lifecycle.openedTableLabel).toBeNull()
  })

  it('simulates delayed canvas click not closing an active dialog', () => {
    const closeScheduleCardTable = vi.fn()
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
      closeScheduleCardTable('canvas-click')
    }

    handleCanvasClick({ suppressTableClick: false, hasScheduleCardTable: true })
    expect(closeScheduleCardTable).not.toHaveBeenCalled()
    expect(dismissFloorTooltips).not.toHaveBeenCalled()
  })

  it('allows explicit dialog close actions', () => {
    let lifecycle = recordScheduleCardOpen(createHostScheduleCardLifecycleState(), {
      tableId: 't10',
      tableLabel: 'T10',
    })
    lifecycle = recordScheduleCardDismiss(lifecycle, 'dialog-close')

    expect(lifecycle.lastDismissSource).toBe('dialog-close')
  })

  it('allows opening another table to replace the current dialog', () => {
    let lifecycle = recordScheduleCardOpen(createHostScheduleCardLifecycleState(), {
      tableId: 't10',
      tableLabel: 'T10',
    })
    lifecycle = recordScheduleCardOpen(lifecycle, { tableId: 't11', tableLabel: 'T11' })

    expect(lifecycle.openedTableLabel).toBe('T11')
    expect(lifecycle.openedTableId).toBe('t11')
  })

  it('does not close when reservation refresh keeps the same floor context', () => {
    const previous = buildHostFloorContextSnapshot({
      areaId: 'main',
      layoutId: 'layout-1',
      publishedAt: '2026-07-10',
    })
    const refreshed = buildHostFloorContextSnapshot({
      areaId: 'main',
      layoutId: 'layout-1',
      publishedAt: '2026-07-10',
    })

    expect(shouldCloseScheduleCardForFloorContextChange({
      previous,
      next: refreshed,
    })).toBe(false)
  })

  it('does not close when only seating data changes without floor context change', () => {
    const context = buildHostFloorContextSnapshot({
      areaId: 'main',
      layoutId: 'layout-1',
      publishedAt: '2026-07-10',
    })

    expect(shouldCloseScheduleCardForFloorContextChange({
      previous: context,
      next: { ...context },
    })).toBe(false)
  })
})
