import { describe, expect, it } from 'vitest'
import { resolvePendingDragSelection } from './dragSelection'

describe('resolvePendingDragSelection', () => {
  it('selects a table on tap without movement in single-select mode', () => {
    expect(resolvePendingDragSelection({
      objectId: 'table-1',
      wasSelected: false,
      isMultiSelect: false,
      moved: false,
    })).toEqual({ type: 'SELECT_OBJECT', objectId: 'table-1' })
  })

  it('selects the dragged table after movement in single-select mode', () => {
    expect(resolvePendingDragSelection({
      objectId: 'table-1',
      wasSelected: false,
      isMultiSelect: false,
      moved: true,
    })).toEqual({ type: 'SELECT_OBJECT', objectId: 'table-1' })
  })

  it('toggles multi-select on tap without movement', () => {
    expect(resolvePendingDragSelection({
      objectId: 'table-2',
      wasSelected: true,
      isMultiSelect: true,
      moved: false,
    })).toEqual({ type: 'TOGGLE_OBJECT_SELECTION', objectId: 'table-2' })
  })

  it('adds an unselected table to multi-select after dragging it', () => {
    expect(resolvePendingDragSelection({
      objectId: 'table-2',
      wasSelected: false,
      isMultiSelect: true,
      moved: true,
    })).toEqual({ type: 'TOGGLE_OBJECT_SELECTION', objectId: 'table-2' })
  })

  it('keeps an already-selected table selected after dragging in multi-select mode', () => {
    expect(resolvePendingDragSelection({
      objectId: 'table-2',
      wasSelected: true,
      isMultiSelect: true,
      moved: true,
    })).toBeNull()
  })
})
