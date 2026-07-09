import { describe, expect, it } from 'vitest'
import { createInitialBuilderState, floorPlanBuilderReducer } from './floorPlanBuilderContextState'
import { FLOOR_PLAN_OBJECT_TYPES } from '../models/floorPlanObject'

function createTable(id, floorId = 'main') {
  return {
    id,
    type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
    floorId,
    position: { x: 100, y: 100 },
    size: { width: 144, height: 144 },
    properties: { shape: 'round', capacity: 2 },
  }
}

describe('selection behavior', () => {
  it('defaults to single-select mode', () => {
    const state = createInitialBuilderState({ initialEditing: true })
    expect(state.multiSelectEnabled).toBe(false)
  })

  it('replaces selection when selecting a different table', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [createTable('table-1'), createTable('table-2')],
      selectedTableIds: ['table-1'],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'SELECT_OBJECT',
      payload: { objectId: 'table-2' },
    })

    expect(nextState.selectedTableIds).toEqual(['table-2'])
  })

  it('collapses multi-selection to the last table when multi-select is disabled', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      multiSelectEnabled: true,
      objects: [createTable('table-1'), createTable('table-2'), createTable('table-3')],
      selectedTableIds: ['table-1', 'table-2', 'table-3'],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'SET_MULTI_SELECT_ENABLED',
      payload: { enabled: false },
    })

    expect(nextState.multiSelectEnabled).toBe(false)
    expect(nextState.selectedTableIds).toEqual(['table-3'])
  })

  it('toggles tables in and out of selection in multi-select mode', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      multiSelectEnabled: true,
      objects: [createTable('table-1'), createTable('table-2')],
      selectedTableIds: ['table-1'],
    }

    const added = floorPlanBuilderReducer(initialState, {
      type: 'TOGGLE_OBJECT_SELECTION',
      payload: { objectId: 'table-2' },
    })
    expect(added.selectedTableIds).toEqual(['table-1', 'table-2'])

    const removed = floorPlanBuilderReducer(added, {
      type: 'TOGGLE_OBJECT_SELECTION',
      payload: { objectId: 'table-1' },
    })
    expect(removed.selectedTableIds).toEqual(['table-2'])
  })
})

describe('CLEAR_ACTIVE_FLOOR_LAYOUT', () => {
  it('removes tables from the active floor and marks the draft dirty', () => {
    const initialState = createInitialBuilderState({
      initialEditing: true,
      initialLayout: {
        floors: [
          { id: 'main', label: 'Main', workspace: { width: 2200, height: 1400, x: 0, y: 0 } },
          { id: 'patio', label: 'Patio', workspace: { width: 2200, height: 1400, x: 0, y: 0 } },
        ],
        activeFloorId: 'main',
        objects: [
          {
            id: 'table-1',
            type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
            floorId: 'main',
            position: { x: 100, y: 100 },
            size: { width: 144, height: 144 },
            properties: { shape: 'round' },
          },
          {
            id: 'table-2',
            type: FLOOR_PLAN_OBJECT_TYPES.TABLE,
            floorId: 'patio',
            position: { x: 200, y: 200 },
            size: { width: 144, height: 144 },
            properties: { shape: 'round' },
          },
        ],
      },
    })

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'CLEAR_ACTIVE_FLOOR_LAYOUT',
    })

    expect(nextState.hasUnsavedChanges).toBe(true)
    expect(nextState.objects).toHaveLength(1)
    expect(nextState.objects[0].id).toBe('table-2')
    expect(nextState.selectedTableIds).toEqual([])
  })
})
