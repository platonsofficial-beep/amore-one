import { describe, expect, it } from 'vitest'
import {
  LAYOUT_HISTORY_LIMIT,
  createInitialBuilderState,
  floorPlanBuilderReducer,
} from './floorPlanBuilderContextState'
import { FLOOR_PLAN_OBJECT_TYPES, buildTableSizePresetPatch } from '../models/floorPlanObject'

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

describe('MOVE_OBJECT', () => {
  it('persists the final dragged position in builder state', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [createTable('table-1')],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'MOVE_OBJECT',
      payload: {
        objectId: 'table-1',
        position: { x: 280, y: 320 },
      },
    })

    expect(nextState.objects[0].position).toEqual({ x: 280, y: 320 })
    expect(nextState.hasUnsavedChanges).toBe(true)
  })
})

describe('UPDATE_TABLE', () => {
  it('applies quick size preset dimensions without changing guest range', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        size: { width: 200, height: 200 },
        properties: {
          shape: 'square',
          capacity: 6,
          minGuests: 4,
          maxGuests: 6,
        },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: buildTableSizePresetPatch('square', 'small'),
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 110, height: 110 })
    expect(nextState.objects[0].properties.minGuests).toBe(4)
    expect(nextState.objects[0].properties.maxGuests).toBe(6)
    expect(nextState.objects[0].properties.capacity).toBe(6)
  })

  it('still updates guests when min/max are explicitly patched', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        size: { width: 200, height: 200 },
        properties: {
          shape: 'square',
          capacity: 6,
          minGuests: 4,
          maxGuests: 6,
        },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: {
          width: 90,
          height: 90,
          minGuests: 1,
          maxGuests: 2,
        },
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 90, height: 90 })
    expect(nextState.objects[0].properties.minGuests).toBe(1)
    expect(nextState.objects[0].properties.maxGuests).toBe(2)
    expect(nextState.objects[0].properties.capacity).toBe(2)
  })

  it('keeps the table selected and preserves a valid position after resizing', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      selectedTableIds: ['table-1'],
      objects: [{
        ...createTable('table-1'),
        position: { x: 200, y: 180 },
        size: { width: 160, height: 160 },
        properties: {
          shape: 'square',
          capacity: 4,
          minGuests: 2,
          maxGuests: 4,
        },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: buildTableSizePresetPatch('square', 'small'),
      },
    })

    const table = nextState.objects[0]
    expect(nextState.selectedTableIds).toEqual(['table-1'])
    expect(table.id).toBe('table-1')
    expect(table.size).toEqual({ width: 110, height: 110 })
    expect(table.properties.minGuests).toBe(2)
    expect(table.properties.maxGuests).toBe(4)
    expect(Number.isFinite(table.position.x)).toBe(true)
    expect(Number.isFinite(table.position.y)).toBe(true)
    expect(table.position.x).toBe(225)
    expect(table.position.y).toBe(205)
  })

  it('applies sizePreset to object.size for canvas rendering without changing guests', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      selectedTableIds: ['table-1'],
      objects: [{
        ...createTable('table-1'),
        position: { x: 200, y: 180 },
        size: { width: 200, height: 120 },
        properties: {
          shape: 'rectangle',
          capacity: 6,
          minGuests: 4,
          maxGuests: 6,
        },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: buildTableSizePresetPatch('rectangle', 'small'),
      },
    })

    const table = nextState.objects[0]
    expect(nextState.selectedTableIds).toEqual(['table-1'])
    expect(table.size).toEqual({ width: 160, height: 90 })
    expect(table.properties.minGuests).toBe(4)
    expect(table.properties.maxGuests).toBe(6)
    expect(table.properties.capacity).toBe(6)
  })

  it('updates all square presets with distinct canvas dimensions', () => {
    const baseTable = {
      ...createTable('table-1'),
      position: { x: 300, y: 240 },
      properties: {
        shape: 'square',
        capacity: 4,
        minGuests: 2,
        maxGuests: 4,
      },
    }
    const presetOrder = ['tiny', 'xs', 'small', 'medium', 'standard', 'large', 'xl', 'xxl']

    const sizes = presetOrder.map((preset) => {
      const nextState = floorPlanBuilderReducer({
        ...createInitialBuilderState({ initialEditing: true }),
        objects: [{
          ...baseTable,
          size: { width: 220, height: 220 },
        }],
      }, {
        type: 'UPDATE_TABLE',
        payload: {
          objectId: 'table-1',
          patch: buildTableSizePresetPatch('square', preset),
        },
      })

      expect(nextState.objects[0].properties.minGuests).toBe(2)
      expect(nextState.objects[0].properties.maxGuests).toBe(4)
      return nextState.objects[0].size
    })

    expect(sizes[0]).toEqual({ width: 70, height: 70 })
    expect(sizes[3]).toEqual({ width: 140, height: 140 })
    expect(sizes[7]).toEqual({ width: 300, height: 300 })
    expect(new Set(sizes.map((size) => size.width)).size).toBe(8)
  })

  it('reset size returns medium dimensions without changing guests', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        size: { width: 300, height: 300 },
        properties: {
          shape: 'square',
          minGuests: 5,
          maxGuests: 8,
          capacity: 8,
        },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: {
          sizePreset: 'medium',
          width: 140,
          height: 140,
        },
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 140, height: 140 })
    expect(nextState.objects[0].properties.minGuests).toBe(5)
    expect(nextState.objects[0].properties.maxGuests).toBe(8)
  })

  it('decreases square width via width-only patch', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        size: { width: 200, height: 200 },
        properties: { shape: 'square', capacity: 4 },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: { width: 192 },
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 192, height: 192 })
  })

  it('decreases rectangle height via height-only patch', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        size: { width: 200, height: 120 },
        properties: { shape: 'rectangle', capacity: 4 },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: { height: 112 },
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 200, height: 112 })
  })

  it('normalizes corrupt tiny tables when edited', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        size: { width: 8, height: 6 },
        properties: { shape: 'square', capacity: 2 },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'UPDATE_TABLE',
      payload: {
        objectId: 'table-1',
        patch: { tableNumber: '9' },
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 64, height: 64 })
  })
})

describe('TRANSFORM_TABLE', () => {
  it('persists resize preview dimensions from canvas handles', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        position: { x: 200, y: 200 },
        size: { width: 200, height: 200 },
        properties: { shape: 'square', capacity: 4 },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'TRANSFORM_TABLE',
      payload: {
        objectId: 'table-1',
        position: { x: 200, y: 200 },
        size: { width: 240, height: 240 },
        rotation: 0,
      },
    })

    expect(nextState.objects[0].size).toEqual({ width: 240, height: 240 })
    expect(nextState.objects[0].position).toEqual({ x: 200, y: 200 })
  })

  it('updates object.size on each live resize commit', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        position: { x: 200, y: 200 },
        size: { width: 200, height: 200 },
        properties: { shape: 'square', capacity: 4 },
      }],
    }

    const midResize = floorPlanBuilderReducer(initialState, {
      type: 'TRANSFORM_TABLE',
      payload: {
        objectId: 'table-1',
        position: { x: 200, y: 200 },
        size: { width: 220, height: 220 },
        rotation: 0,
      },
    })

    const afterRelease = floorPlanBuilderReducer(midResize, {
      type: 'TRANSFORM_TABLE',
      payload: {
        objectId: 'table-1',
        position: { x: 200, y: 200 },
        size: { width: 240, height: 240 },
        rotation: 0,
      },
    })

    expect(midResize.objects[0].size).toEqual({ width: 220, height: 220 })
    expect(afterRelease.objects[0].size).toEqual({ width: 240, height: 240 })
  })

  it('rejects invalid transform bounds instead of snapping to origin', () => {
    const initialState = {
      ...createInitialBuilderState({ initialEditing: true }),
      objects: [{
        ...createTable('table-1'),
        position: { x: 200, y: 200 },
        size: { width: 200, height: 200 },
        properties: { shape: 'square', capacity: 4 },
      }],
    }

    const nextState = floorPlanBuilderReducer(initialState, {
      type: 'TRANSFORM_TABLE',
      payload: {
        objectId: 'table-1',
        position: { x: 0, y: 0 },
        size: { width: 0, height: 0 },
        rotation: 0,
      },
    })

    expect(nextState.objects[0].position).toEqual({ x: 200, y: 200 })
    expect(nextState.objects[0].size).toEqual({ width: 200, height: 200 })
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

describe('layout undo and redo', () => {
  function editingState(overrides = {}) {
    const state = {
      ...createInitialBuilderState({ initialEditing: true }),
      ...overrides,
    }
    return {
      ...state,
      hasUnsavedChanges: false,
      savedSnapshot: {
        floors: state.floors,
        objects: state.objects,
        activeFloorId: state.activeFloorId,
      },
    }
  }

  it('undoes and redoes a table move as one step', () => {
    const initialState = editingState({
      objects: [createTable('table-1')],
    })

    const moved = floorPlanBuilderReducer(initialState, {
      type: 'MOVE_OBJECT',
      payload: { objectId: 'table-1', position: { x: 280, y: 320 } },
    })
    expect(moved.objects[0].position).toEqual({ x: 280, y: 320 })
    expect(moved.undoStack).toHaveLength(1)
    expect(moved.redoStack).toHaveLength(0)

    const undone = floorPlanBuilderReducer(moved, { type: 'UNDO' })
    expect(undone.objects[0].position).toEqual({ x: 100, y: 100 })
    expect(undone.hasUnsavedChanges).toBe(false)
    expect(undone.redoStack).toHaveLength(1)

    const redone = floorPlanBuilderReducer(undone, { type: 'REDO' })
    expect(redone.objects[0].position).toEqual({ x: 280, y: 320 })
    expect(redone.hasUnsavedChanges).toBe(true)
  })

  it('coalesces drag frames that share a history key', () => {
    let state = editingState({ objects: [createTable('table-1')] })
    state = floorPlanBuilderReducer(state, {
      type: 'MOVE_OBJECT',
      payload: { objectId: 'table-1', position: { x: 140, y: 140 }, historyKey: 'move-1' },
    })
    state = floorPlanBuilderReducer(state, {
      type: 'MOVE_OBJECT',
      payload: { objectId: 'table-1', position: { x: 180, y: 200 }, historyKey: 'move-1' },
    })

    expect(state.undoStack).toHaveLength(1)
    expect(state.objects[0].position).toEqual({ x: 180, y: 200 })

    const undone = floorPlanBuilderReducer(state, { type: 'UNDO' })
    expect(undone.objects[0].position).toEqual({ x: 100, y: 100 })
  })

  it('records resize, rotate, add, delete, and area rename', () => {
    let state = editingState({ objects: [createTable('table-1')] })

    state = floorPlanBuilderReducer(state, {
      type: 'TRANSFORM_TABLE',
      payload: {
        objectId: 'table-1',
        position: { x: 80, y: 80 },
        size: { width: 180, height: 180 },
        rotation: 45,
      },
    })
    state = floorPlanBuilderReducer(state, {
      type: 'ADD_OBJECT',
      payload: { object: createTable('table-2') },
    })
    state = floorPlanBuilderReducer(state, {
      type: 'RENAME_FLOOR',
      payload: { floorId: state.activeFloorId, label: 'Patio' },
    })
    state = floorPlanBuilderReducer(state, {
      type: 'DELETE_OBJECT',
      payload: { objectId: 'table-2' },
    })

    expect(state.undoStack).toHaveLength(4)
    expect(state.objects.map((object) => object.id)).toEqual(['table-1'])
    expect(state.floors.find((floor) => floor.id === state.activeFloorId)?.label).toBe('Patio')

    const undoneDelete = floorPlanBuilderReducer(state, { type: 'UNDO' })
    expect(undoneDelete.objects.map((object) => object.id)).toEqual(['table-1', 'table-2'])

    const undoneRename = floorPlanBuilderReducer(undoneDelete, { type: 'UNDO' })
    expect(undoneRename.floors.find((floor) => floor.id === undoneRename.activeFloorId)?.label).not.toBe('Patio')
  })

  it('does not record camera or selection changes', () => {
    const initialState = editingState({ objects: [createTable('table-1')] })
    const selected = floorPlanBuilderReducer(initialState, {
      type: 'SELECT_OBJECT',
      payload: { objectId: 'table-1' },
    })
    const zoomed = floorPlanBuilderReducer(selected, {
      type: 'SET_CAMERA',
      payload: { zoom: 1.4 },
    })

    expect(zoomed.undoStack).toEqual([])
    expect(zoomed.selectedTableIds).toEqual(['table-1'])
  })

  it('caps history and ignores undo after cancel leaves editing', () => {
    let state = editingState({ objects: [createTable('table-1')] })
    for (let step = 1; step <= LAYOUT_HISTORY_LIMIT + 5; step += 1) {
      state = floorPlanBuilderReducer(state, {
        type: 'MOVE_OBJECT',
        payload: { objectId: 'table-1', position: { x: 100 + step, y: 100 } },
      })
    }

    expect(state.undoStack).toHaveLength(LAYOUT_HISTORY_LIMIT)

    const cancelled = floorPlanBuilderReducer(state, { type: 'CANCEL_EDITING' })
    expect(cancelled.mode).toBe('viewing')
    expect(cancelled.undoStack).toEqual([])
    expect(floorPlanBuilderReducer(cancelled, { type: 'UNDO' })).toBe(cancelled)
  })
})
