import { useMemo, useReducer } from 'react'
import { createCamera } from '../lib/camera'
import { getDemoFloorPlanObjects } from '../models/floorPlanObject'
import { createInitialFloors } from '../models/floorPlans'
import { createDefaultFloor, getWorkspaceBounds } from '../models/floorWorkspace'
import { FloorPlanBuilderContext } from './floorPlanBuilderContext'

const INITIAL_FLOORS = createInitialFloors()

const initialState = {
  floors: INITIAL_FLOORS,
  activeFloorId: 'main-dining',
  objects: getDemoFloorPlanObjects(),
  selectedObjectIds: [],
  toolboxSelectionId: null,
  activeTool: 'select',
  mode: 'editing',
  hasUnsavedChanges: false,
  settings: {
    gridEnabled: true,
    snapEnabled: true,
  },
  camera: createCamera(),
}

function floorPlanBuilderReducer(state, action) {
  switch (action.type) {
    case 'SELECT_OBJECT': {
      const { objectId } = action.payload
      if (!objectId) {
        return { ...state, selectedObjectIds: [] }
      }

      return { ...state, selectedObjectIds: [objectId] }
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedObjectIds: [] }
    case 'SELECT_TOOLBOX_ITEM':
      return { ...state, toolboxSelectionId: action.payload.itemId }
    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.payload.toolId }
    case 'SET_ACTIVE_FLOOR':
      return {
        ...state,
        activeFloorId: action.payload.floorId,
        selectedObjectIds: [],
      }
    case 'SET_CAMERA':
      return {
        ...state,
        camera: createCamera({
          ...state.camera,
          ...action.payload,
        }),
      }
    case 'SET_MODE':
      return { ...state, mode: action.payload.mode }
    case 'MOVE_OBJECT':
      return {
        ...state,
        hasUnsavedChanges: true,
        objects: state.objects.map((object) => (
          object.id === action.payload.objectId
            ? {
              ...object,
              position: {
                x: action.payload.position.x,
                y: action.payload.position.y,
              },
            }
            : object
        )),
      }
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

  const activeWorkspace = useMemo(() => ({
    ...createDefaultFloor(),
    ...(activeFloor?.workspace ?? INITIAL_FLOORS[0].workspace),
  }), [activeFloor])

  const activeWorkspaceBounds = useMemo(() => (
    getWorkspaceBounds(activeWorkspace)
  ), [activeWorkspace])

  const value = useMemo(() => ({
    state,
    dispatch,
    visibleObjects,
    selectedObject,
    activeFloor,
    activeWorkspace,
    activeWorkspaceBounds,
    objectCount: visibleObjects.length,
  }), [activeFloor, activeWorkspace, activeWorkspaceBounds, dispatch, selectedObject, state, visibleObjects])

  return (
    <FloorPlanBuilderContext.Provider value={value}>
      {children}
    </FloorPlanBuilderContext.Provider>
  )
}
