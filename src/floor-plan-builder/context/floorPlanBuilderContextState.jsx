import { useMemo, useReducer } from 'react'
import { createCamera } from '../lib/camera'
import { loadFloorPlanLayout, saveFloorPlanLayout } from '../lib/floorPlanStorage'
import {
  FLOOR_PLAN_OBJECT_TYPES,
  getTableShapeSize,
} from '../models/floorPlanObject'
import { createInitialFloors, createUniqueAreaId } from '../models/floorPlans'
import { createDefaultFloor, createDefaultWorkspace, getWorkspaceBounds } from '../models/floorWorkspace'
import {
  fitTableRectToFloor,
  getTableMinSize,
  keepsTableAspectRatio,
  normalizeRotation,
} from '../lib/tableTransformUtils'
import { getTableSectionTotals, normalizeTableSection } from '../lib/tableSections'
import { FloorPlanBuilderContext } from './floorPlanBuilderContext'

function getFloorWorkspaceBounds(floors, floorId) {
  const floor = floors.find((entry) => entry.id === floorId)
  const workspace = {
    ...createDefaultFloor(),
    ...(floor?.workspace ?? createDefaultWorkspace()),
  }
  return getWorkspaceBounds(workspace)
}

function createLayoutSnapshot(state) {
  return {
    floors: state.floors,
    objects: state.objects,
    activeFloorId: state.activeFloorId,
  }
}

function createInitialBuilderState() {
  const persisted = loadFloorPlanLayout()
  const floors = persisted?.floors ?? createInitialFloors()
  const objects = persisted?.objects ?? []
  const activeFloorId = persisted?.activeFloorId ?? floors[0]?.id ?? 'main-dining'
  const baseState = {
    floors,
    activeFloorId,
    objects,
    selectedObjectIds: [],
    toolboxSelectionId: null,
    activeTool: 'select',
    mode: 'viewing',
    hasUnsavedChanges: false,
    savedSnapshot: null,
    settings: {
      gridEnabled: true,
      snapEnabled: true,
    },
    camera: createCamera(),
  }

  return {
    ...baseState,
    savedSnapshot: createLayoutSnapshot(baseState),
  }
}

function isBuilderEditing(state) {
  return state.mode === 'editing'
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
      if (!isBuilderEditing(state)) return state
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
    case 'START_EDITING':
      return {
        ...state,
        mode: 'editing',
        savedSnapshot: createLayoutSnapshot(state),
        toolboxSelectionId: null,
        selectedObjectIds: [],
      }
    case 'SAVE_LAYOUT': {
      const snapshot = createLayoutSnapshot(state)
      saveFloorPlanLayout({
        floors: state.floors,
        activeFloorId: state.activeFloorId,
        objects: state.objects,
      })
      return {
        ...state,
        mode: 'viewing',
        hasUnsavedChanges: false,
        savedSnapshot: snapshot,
        toolboxSelectionId: null,
        selectedObjectIds: [],
      }
    }
    case 'CANCEL_EDITING': {
      const snapshot = state.savedSnapshot ?? createLayoutSnapshot(state)
      return {
        ...state,
        floors: snapshot.floors,
        objects: snapshot.objects,
        activeFloorId: snapshot.activeFloorId,
        mode: 'viewing',
        hasUnsavedChanges: false,
        toolboxSelectionId: null,
        selectedObjectIds: [],
      }
    }
    case 'MOVE_OBJECT':
      if (!isBuilderEditing(state)) return state
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
    case 'TRANSFORM_TABLE': {
      if (!isBuilderEditing(state)) return state
      const { objectId, position, size, rotation } = action.payload
      if (!objectId) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: state.objects.map((object) => {
          if (object.id !== objectId) return object
          if (object.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) return object

          const shape = object.properties.shape ?? 'round'
          const bounds = getFloorWorkspaceBounds(state.floors, object.floorId)
          const fitted = fitTableRectToFloor(
            position ?? object.position,
            size ?? object.size,
            bounds,
            shape,
          )

          return {
            ...object,
            position: fitted.position,
            size: fitted.size,
            rotation: normalizeRotation(rotation ?? object.rotation ?? 0),
          }
        }),
      }
    }
    case 'ADD_OBJECT':
      if (!isBuilderEditing(state)) return state
      return {
        ...state,
        hasUnsavedChanges: true,
        objects: [...state.objects, action.payload.object],
        selectedObjectIds: [action.payload.object.id],
        toolboxSelectionId: null,
      }
    case 'UPDATE_TABLE': {
      if (!isBuilderEditing(state)) return state
      const { objectId, patch } = action.payload
      if (!objectId) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: state.objects.map((object) => {
          if (object.id !== objectId) return object
          if (object.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) return object

          const nextShape = patch.shape ?? object.properties.shape ?? 'round'
          const shapeChanged = patch.shape !== undefined && patch.shape !== object.properties.shape
          const nextFloorId = patch.floorId ?? object.floorId
          const floor = state.floors.find((entry) => entry.id === nextFloorId)
          const nextAreaLabel = floor?.label ?? object.properties.area
          const tableNumber = `${patch.tableNumber ?? object.properties.tableNumber ?? ''}`.trim()
          const capacity = Math.max(1, Number(patch.capacity ?? object.properties.capacity) || 1)
          const nextSections = patch.sections !== undefined
            ? patch.sections.map(normalizeTableSection)
            : (object.properties.sections ?? [])
          const sectionTotals = getTableSectionTotals(nextSections)

          let nextSize = { ...object.size }
          if (shapeChanged) {
            nextSize = getTableShapeSize(nextShape)
          } else if (patch.width !== undefined || patch.height !== undefined) {
            let width = Math.max(getTableMinSize(nextShape).width, Number(patch.width ?? object.size.width) || object.size.width)
            let height = Math.max(getTableMinSize(nextShape).height, Number(patch.height ?? object.size.height) || object.size.height)
            if (keepsTableAspectRatio(nextShape)) {
              const dim = Math.max(width, height)
              width = dim
              height = dim
            }
            nextSize = { width, height }
          }

          let nextRotation = object.rotation ?? 0
          if (patch.rotation !== undefined) {
            nextRotation = normalizeRotation(patch.rotation)
          }

          const fitted = fitTableRectToFloor(
            object.position,
            nextSize,
            getFloorWorkspaceBounds(state.floors, nextFloorId),
            nextShape,
          )

          let nextCapacity = capacity
          if (nextSections.length > 0) {
            nextCapacity = Math.max(1, sectionTotals.stools)
          }

          return {
            ...object,
            floorId: nextFloorId,
            size: fitted.size,
            position: fitted.position,
            rotation: nextRotation,
            properties: {
              ...object.properties,
              tableNumber,
              name: tableNumber ? `Table ${tableNumber}` : 'Table',
              capacity: nextCapacity,
              shape: nextShape,
              area: nextAreaLabel,
              sections: nextSections,
            },
          }
        }),
      }
    }
    case 'DELETE_OBJECT': {
      if (!isBuilderEditing(state)) return state
      const { objectId } = action.payload
      if (!objectId) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: state.objects.filter((object) => object.id !== objectId),
        selectedObjectIds: state.selectedObjectIds.filter((id) => id !== objectId),
      }
    }
    case 'ADD_FLOOR': {
      if (!isBuilderEditing(state)) return state
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
      if (!isBuilderEditing(state)) return state
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
      if (!isBuilderEditing(state)) return state
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
  const [state, dispatch] = useReducer(floorPlanBuilderReducer, undefined, createInitialBuilderState)

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
    ...(activeFloor?.workspace ?? createDefaultWorkspace()),
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
