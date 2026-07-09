import { useEffect, useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'
import {
  createTableObjectFromType,
  findReferenceTableForShape,
  resolveTableSizeForNewTable,
} from '../models/floorPlanObject'
import { floorBoundaryService } from '../services/FloorBoundaryService'
import { PanelHeader } from './PanelHeader'

const BASIC_TABLE_SHAPES = ['round', 'square', 'rectangle']

const SHAPE_ADD_LABELS = {
  round: '+ Round table',
  square: '+ Square table',
  rectangle: '+ Rectangle table',
}

export function BuilderToolbox({ onClose, showCloseButton = false }) {
  const {
    dispatch,
    state,
    activeFloor,
    activeWorkspaceBounds,
  } = useFloorPlanBuilder()
  const { floors } = state
  const [newAreaName, setNewAreaName] = useState('')
  const [renameValue, setRenameValue] = useState(activeFloor?.label ?? '')

  useEffect(() => {
    setRenameValue(activeFloor?.label ?? '')
  }, [activeFloor?.id, activeFloor?.label])

  const handleCreateArea = () => {
    const label = newAreaName.trim()
    if (!label) return

    dispatch({ type: 'ADD_FLOOR', payload: { label } })
    setNewAreaName('')
  }

  const handleRenameArea = () => {
    const label = renameValue.trim()
    if (!label || label === activeFloor?.label) return

    dispatch({
      type: 'RENAME_FLOOR',
      payload: { floorId: state.activeFloorId, label },
    })
  }

  const handleDeleteArea = () => {
    if (floors.length <= 1) return

    const confirmed = window.confirm(
      `Delete "${activeFloor.label}" and remove its tables?`,
    )
    if (!confirmed) return

    dispatch({
      type: 'DELETE_FLOOR',
      payload: { floorId: state.activeFloorId },
    })
  }

  const placeTable = (tableType) => {
    const shape = tableType.shape ?? 'round'
    const referenceTable = findReferenceTableForShape({
      objects: state.objects,
      shape,
      floorId: state.activeFloorId,
      selectedTableIds: state.selectedTableIds,
    })
    const size = resolveTableSizeForNewTable(shape, referenceTable)
    const tablesOnFloor = state.objects.filter((object) => (
      object.floorId === state.activeFloorId && object.type === 'table'
    )).length
    const stackOffset = tablesOnFloor * 28
    const centeredPosition = floorBoundaryService.clampToFloor(
      {
        x: activeWorkspaceBounds.centerX - (size.width / 2) + stackOffset,
        y: activeWorkspaceBounds.centerY - (size.height / 2) + stackOffset,
      },
      size,
      activeWorkspaceBounds,
    )
    const object = createTableObjectFromType({
      tableType,
      position: centeredPosition,
      floorId: state.activeFloorId,
      areaLabel: activeFloor.label,
      objects: state.objects,
      selectedTableIds: state.selectedTableIds,
      size,
      floors,
    })

    dispatch({ type: 'ADD_OBJECT', payload: { object } })
  }

  const isEditing = state.mode === 'editing'
  const basicTableTypes = TABLE_TYPES.filter((tableType) => (
    BASIC_TABLE_SHAPES.includes(tableType.shape)
  ))

  return (
    <aside className={`fpb-toolbox fpb-toolbox-simple${isEditing ? '' : ' is-locked'}`} aria-label="Floor plan builder">
      <div className="fpb-toolbox-scroll">
        <PanelHeader
          eyebrow="Restaurant"
          title="Areas"
          onClose={onClose}
          showClose={showCloseButton}
        />

        <div className="fpb-area-panel">
          <label className="fpb-area-field">
            <span>Rename area</span>
            <input
              type="text"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleRenameArea()
              }}
              disabled={!isEditing}
            />
          </label>
          <button
            type="button"
            className="fpb-area-action-btn"
            onClick={handleRenameArea}
            disabled={!isEditing || !renameValue.trim() || renameValue.trim() === activeFloor?.label}
          >
            Rename area
          </button>

          <label className="fpb-area-field">
            <span>New area</span>
            <input
              type="text"
              value={newAreaName}
              onChange={(event) => setNewAreaName(event.target.value)}
              placeholder="e.g. Patio"
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateArea()
              }}
              disabled={!isEditing}
            />
          </label>
          <button
            type="button"
            className="fpb-area-action-btn"
            onClick={handleCreateArea}
            disabled={!isEditing || !newAreaName.trim()}
          >
            Create area
          </button>

          <button
            type="button"
            className="fpb-area-action-btn fpb-area-action-btn-danger"
            onClick={handleDeleteArea}
            disabled={!isEditing || floors.length <= 1}
          >
            Delete area
          </button>
        </div>

        <div className="fpb-panel-header fpb-panel-header-spaced">
          <p className="fpb-panel-eyebrow">Floor plan</p>
          <h2 className="fpb-panel-title">Tables</h2>
        </div>

        <div className="fpb-toolbox-table-actions" aria-label="Add tables">
          {basicTableTypes.map((tableType) => (
            <button
              key={tableType.id}
              type="button"
              className="fpb-toolbox-add-shape-btn"
              disabled={!isEditing}
              onClick={() => placeTable(tableType)}
            >
              {SHAPE_ADD_LABELS[tableType.shape] ?? `+ ${tableType.label}`}
            </button>
          ))}
        </div>

        <p className="fpb-toolbox-hint">
          {isEditing
            ? <>Adds a table to the center of <strong>{activeFloor?.label}</strong>. Drag to move, tap to edit properties.</>
            : 'Layout is locked in view mode. Click Edit layout to make changes.'}
        </p>
      </div>
    </aside>
  )
}
