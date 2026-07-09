import { describe, expect, it } from 'vitest'
import { createInitialBuilderState, floorPlanBuilderReducer } from './floorPlanBuilderContextState'
import { FLOOR_PLAN_OBJECT_TYPES } from '../models/floorPlanObject'

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
