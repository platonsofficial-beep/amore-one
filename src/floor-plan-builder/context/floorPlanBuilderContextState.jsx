import { useMemo, useReducer } from 'react'
import { getDemoFloorPlanObjects } from '../models/floorPlanObject'
import { FloorPlanBuilderContext } from './floorPlanBuilderContext'

const INITIAL_FLOORS = [
  { id: 'main-dining', label: 'Main Dining' },
  { id: 'patio', label: 'Patio' },
  { id: 'rooftop', label: 'Rooftop' },
]

const initialState = {
  floors: INITIAL_FLOORS,
  activeFloorId: 'main-dining',
  objects: getDemoFloorPlanObjects(),
  selectedObjectIds: [],
  toolboxSelectionId: null,
  mode: 'editing',
  hasUnsavedChanges: false,
  settings: {
    gridEnabled: true,
    snapEnabled: false,
  },
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
}

function floorPlanBuilderReducer(state, action) {
  switch (action.type) {
    case 'SELECT_OBJECT': {
      const { objectId, append = false } = action.payload
      if (!objectId) {
        return { ...state, selectedObjectIds: [] }
      }

      if (append) {
        const isSelected = state.selectedObjectIds.includes(objectId)
        return {
          ...state,
          selectedObjectIds: isSelected
            ? state.selectedObjectIds.filter((id) => id !== objectId)
            : [...state.selectedObjectIds, objectId],
        }
      }

      return { ...state, selectedObjectIds: [objectId] }
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedObjectIds: [] }
    case 'SELECT_TOOLBOX_ITEM':
      return { ...state, toolboxSelectionId: action.payload.itemId }
    case 'SET_ACTIVE_FLOOR':
      return {
        ...state,
        activeFloorId: action.payload.floorId,
        selectedObjectIds: [],
      }
    case 'SET_VIEWPORT':
      return {
        ...state,
        viewport: {
          ...state.viewport,
          ...action.payload,
        },
      }
    case 'SET_MODE':
      return { ...state, mode: action.payload.mode }
    default:
      return state
  }
}

export function FloorPlanBuilderProvider({ children }) {
  const [state, dispatch] = useReducer(floorPlanBuilderReducer, initialState)

  const visibleObjects = useMemo(() => (
    state.objects.filter((object) => object.floorId === state.activeFloorId)
  ), [state.activeFloorId, state.objects])

  const selectedObject = useMemo(() => {
    const selectedId = state.selectedObjectIds[0]
    if (!selectedId) return null
    return state.objects.find((object) => object.id === selectedId) ?? null
  }, [state.objects, state.selectedObjectIds])

  const activeFloor = useMemo(() => (
    state.floors.find((floor) => floor.id === state.activeFloorId) ?? state.floors[0]
  ), [state.activeFloorId, state.floors])

  const value = useMemo(() => ({
    state,
    dispatch,
    visibleObjects,
    selectedObject,
    activeFloor,
    objectCount: visibleObjects.length,
  }), [activeFloor, dispatch, selectedObject, state, visibleObjects])

  return (
    <FloorPlanBuilderContext.Provider value={value}>
      {children}
    </FloorPlanBuilderContext.Provider>
  )
}
