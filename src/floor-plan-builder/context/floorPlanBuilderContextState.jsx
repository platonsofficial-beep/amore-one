import { useMemo, useReducer } from 'react'
import { createCamera } from '../lib/camera'
import { getDemoFloorPlanObjects } from '../models/floorPlanObject'
import { createInitialFloors, createUniqueAreaId } from '../models/floorPlans'
import { FLOOR_PLAN_OBJECT_TYPES } from '../models/floorPlanObject'
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
    case 'ADD_OBJECT':
      return {
        ...state,
        hasUnsavedChanges: true,
        objects: [...state.objects, action.payload.object],
        selectedObjectIds: [action.payload.object.id],
      }
    case 'ADD_FLOOR': {
      const label = `${action.payload.label ?? ''}`.trim()
      if (!label) return state

      const id = createUniqueAreaId(label, state.floors)
      const nextFloor = {
        id,
        label,
        workspace: { ...createDefaultWorkspace() },
      }

      return {
        ...state,
        hasUnsavedChanges: true,
        floors: [...state.floors, nextFloor],
        activeFloorId: id,
        selectedObjectIds: [],
      }
    }
    case 'RENAME_FLOOR': {
      const label = `${action.payload.label ?? ''}`.trim()
      const { floorId } = action.payload
      if (!label || !floorId) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        floors: state.floors.map((floor) => (
          floor.id === floorId ? { ...floor, label } : floor
        )),
        objects: state.objects.map((object) => (
          object.floorId === floorId && object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
            ? {
              ...object,
              properties: {
                ...object.properties,
                area: label,
              },
            }
            : object
        )),
      }
    }
    case 'DELETE_FLOOR': {
      const { floorId } = action.payload
      if (!floorId || state.floors.length <= 1) return state

      const nextFloors = state.floors.filter((floor) => floor.id !== floorId)
      const nextActiveFloorId = state.activeFloorId === floorId
        ? nextFloors[0].id
        : state.activeFloorId

      return {
        ...state,
        hasUnsavedChanges: true,
        floors: nextFloors,
        activeFloorId: nextActiveFloorId,
        objects: state.objects.filter((object) => object.floorId !== floorId),
        selectedObjectIds: [],
      }
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
