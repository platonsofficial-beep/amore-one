import { useEffect, useMemo, useReducer } from 'react'
import { createCamera } from '../lib/camera'
import {
  alignSelectedTablesHorizontal,
  alignSelectedTablesVertical,
  matchSelectedTablesSize,
} from '../lib/alignSelectedTables'
import { autoArrangeFloorTables } from '../lib/autoArrangeLayout'
import { cloneBuilderLayout, loadFloorPlanLayout, saveFloorPlanLayout } from '../lib/floorPlanStorage'
import {
  FLOOR_PLAN_OBJECT_TYPES,
  getTableShapeSize,
  normalizeFloorPlanTableObject,
  normalizeLayoutObjects,
} from '../models/floorPlanObject'
import { createInitialFloors, createUniqueAreaId } from '../models/floorPlans'
import { createDefaultFloor, createDefaultWorkspace, expandFloorWorkspace, getWorkspaceBounds, resetFloorWorkspace } from '../models/floorWorkspace'
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

function cloneLayoutData({ floors, objects, activeFloorId }) {
  return JSON.parse(JSON.stringify({
    floors,
    objects,
    activeFloorId,
  }))
}

function createLayoutSnapshot(state) {
  return cloneLayoutData({
    floors: state.floors,
    objects: state.objects,
    activeFloorId: state.activeFloorId,
  })
}

function createInitialBuilderState({ initialEditing = false, initialLayout = null } = {}) {
  const persisted = initialLayout ?? loadFloorPlanLayout()
  const floors = persisted?.floors ?? createInitialFloors()
  const activeFloorId = persisted?.activeFloorId ?? floors[0]?.id ?? 'main-dining'
  const objects = normalizeLayoutObjects(persisted?.objects ?? [], floors, activeFloorId)
  const baseState = {
    floors,
    activeFloorId,
    objects,
    selectedTableIds: [],
    toolboxSelectionId: null,
    activeTool: 'select',
    mode: initialEditing ? 'editing' : 'viewing',
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
        return { ...state, selectedTableIds: [] }
      }

      if (!state.objects.some((object) => object.id === objectId)) {
        return { ...state, selectedTableIds: [] }
      }

      return { ...state, selectedTableIds: [objectId] }
    }
    case 'ADD_TABLE_TO_SELECTION': {
      const { objectId } = action.payload
      if (!objectId || state.selectedTableIds.includes(objectId)) return state

      return {
        ...state,
        selectedTableIds: [...state.selectedTableIds, objectId],
      }
    }
    case 'REMOVE_TABLE_FROM_SELECTION': {
      const { objectId } = action.payload
      if (!objectId) return state

      return {
        ...state,
        selectedTableIds: state.selectedTableIds.filter((id) => id !== objectId),
      }
    }
    case 'TOGGLE_OBJECT_SELECTION': {
      const { objectId } = action.payload
      if (!objectId) return state

      const isSelected = state.selectedTableIds.includes(objectId)
      return {
        ...state,
        selectedTableIds: isSelected
          ? state.selectedTableIds.filter((id) => id !== objectId)
          : [...state.selectedTableIds, objectId],
      }
    }
    case 'CLEAR_SELECTION':
      return { ...state, selectedTableIds: [] }
    case 'SELECT_TOOLBOX_ITEM':
      if (!isBuilderEditing(state)) return state
      return { ...state, toolboxSelectionId: action.payload.itemId }
    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.payload.toolId }
    case 'SET_ACTIVE_FLOOR':
      return {
        ...state,
        activeFloorId: action.payload.floorId,
        selectedTableIds: [],
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
        selectedTableIds: [],
      }
    case 'MARK_DRAFT_SAVED': {
      const snapshot = createLayoutSnapshot(state)
      return {
        ...state,
        hasUnsavedChanges: false,
        savedSnapshot: snapshot,
      }
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
        selectedTableIds: [],
      }
    }
    case 'PUBLISH_LAYOUT': {
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
        selectedTableIds: [],
      }
    }
    case 'CANCEL_EDITING': {
      const snapshot = state.savedSnapshot ?? createLayoutSnapshot(state)
      return {
        ...state,
        ...cloneLayoutData(snapshot),
        mode: 'viewing',
        hasUnsavedChanges: false,
        toolboxSelectionId: null,
        selectedTableIds: [],
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
    case 'SYNC_SELECTION': {
      const validIds = state.selectedTableIds.filter((id) => (
        state.objects.some((object) => object.id === id)
      ))
      if (validIds.length === state.selectedTableIds.length) return state
      return { ...state, selectedTableIds: validIds }
    }
    case 'ADD_OBJECT': {
      if (!isBuilderEditing(state)) return state
      const object = normalizeFloorPlanTableObject(action.payload.object, {
        floors: state.floors,
        defaultFloorId: state.activeFloorId,
      })
      if (!object?.id) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: [...state.objects, object],
        selectedTableIds: [object.id],
        toolboxSelectionId: null,
      }
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
        selectedTableIds: state.selectedTableIds.filter((id) => id !== objectId),
      }
    }
    case 'DELETE_SELECTED_TABLES': {
      if (!isBuilderEditing(state)) return state
      if (!state.selectedTableIds.length) return state

      const selected = new Set(state.selectedTableIds)
      return {
        ...state,
        hasUnsavedChanges: true,
        objects: state.objects.filter((object) => !selected.has(object.id)),
        selectedTableIds: [],
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
        selectedTableIds: [],
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
    case 'UPDATE_FLOOR_WORKSPACE': {
      if (!isBuilderEditing(state)) return state

      const {
        floorId = state.activeFloorId,
        widthDelta = 0,
        heightDelta = 0,
        reset = false,
      } = action.payload ?? {}

      if (!floorId) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        floors: state.floors.map((floor) => {
          if (floor.id !== floorId) return floor

          const nextWorkspace = reset
            ? resetFloorWorkspace(floor.workspace)
            : expandFloorWorkspace(floor.workspace, { widthDelta, heightDelta })

          return {
            ...floor,
            workspace: nextWorkspace,
          }
        }),
      }
    }
    case 'MATCH_SELECTED_TABLE_SIZE': {
      if (!isBuilderEditing(state)) return state
      if (state.selectedTableIds.length < 2) return state

      const result = matchSelectedTablesSize(
        state.objects,
        state.selectedTableIds,
        state.activeFloorId,
        state.floors,
      )

      if (!result.matched) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: result.objects,
      }
    }
    case 'ALIGN_SELECTED_HORIZONTAL': {
      if (!isBuilderEditing(state)) return state
      if (state.selectedTableIds.length < 2) return state

      const result = alignSelectedTablesHorizontal(
        state.objects,
        state.selectedTableIds,
        state.activeFloorId,
        state.floors,
      )

      if (!result.aligned) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: result.objects,
      }
    }
    case 'ALIGN_SELECTED_VERTICAL': {
      if (!isBuilderEditing(state)) return state
      if (state.selectedTableIds.length < 2) return state

      const result = alignSelectedTablesVertical(
        state.objects,
        state.selectedTableIds,
        state.activeFloorId,
        state.floors,
      )

      if (!result.aligned) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: result.objects,
      }
    }
    case 'AUTO_ARRANGE_FLOOR': {
      if (!isBuilderEditing(state)) return state

      return {
        ...state,
        hasUnsavedChanges: true,
        objects: autoArrangeFloorTables(state.objects, state.activeFloorId, state.floors),
        selectedTableIds: [],
      }
    }
    case 'AUTO_ARRANGE_AND_PUBLISH': {
      if (!isBuilderEditing(state)) return state

      const arrangedObjects = autoArrangeFloorTables(
        state.objects,
        state.activeFloorId,
        state.floors,
      )
      const nextState = {
        ...state,
        hasUnsavedChanges: false,
        objects: arrangedObjects,
        selectedTableIds: [],
        toolboxSelectionId: null,
      }
      const snapshot = createLayoutSnapshot(nextState)

      saveFloorPlanLayout({
        floors: nextState.floors,
        activeFloorId: nextState.activeFloorId,
        objects: nextState.objects,
      })

      return {
        ...nextState,
        mode: 'viewing',
        savedSnapshot: snapshot,
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
        selectedTableIds: [],
      }
    }
    default:
      return state
  }
}

export function FloorPlanBuilderProvider({ children, initialEditing = false, initialLayout = null }) {
  const [state, dispatch] = useReducer(
    floorPlanBuilderReducer,
    { initialEditing, initialLayout: initialLayout ? cloneBuilderLayout(initialLayout) : null },
    createInitialBuilderState,
  )

  useEffect(() => {
    if (!state.selectedTableIds.length) return
    const hasMissingSelection = state.selectedTableIds.some((id) => (
      !state.objects.some((object) => object.id === id)
    ))
    if (hasMissingSelection) {
      dispatch({ type: 'SYNC_SELECTION' })
    }
  }, [state.objects, state.selectedTableIds])

  const visibleObjects = useMemo(() => (
    state.objects.filter((object) => object.floorId === state.activeFloorId)
  ), [state.activeFloorId, state.objects])

  const selectedObject = useMemo(() => {
    const selectedId = state.selectedTableIds[0]
    if (!selectedId) return null
    return state.objects.find((object) => object.id === selectedId) ?? null
  }, [state.objects, state.selectedTableIds])

  const selectedObjects = useMemo(() => (
    state.selectedTableIds
      .map((objectId) => state.objects.find((object) => object.id === objectId))
      .filter(Boolean)
  ), [state.objects, state.selectedTableIds])

  const selectedTables = useMemo(() => (
    selectedObjects.filter((object) => object.type === FLOOR_PLAN_OBJECT_TYPES.TABLE)
  ), [selectedObjects])

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
    selectedObjects,
    selectedTables,
    selectedTableIds: state.selectedTableIds,
    activeFloor,
    activeWorkspace,
    activeWorkspaceBounds,
    objectCount: visibleObjects.length,
  }), [activeFloor, activeWorkspace, activeWorkspaceBounds, dispatch, selectedObject, selectedObjects, selectedTables, state, visibleObjects])

  return (
    <FloorPlanBuilderContext.Provider value={value}>
      {children}
    </FloorPlanBuilderContext.Provider>
  )
}
