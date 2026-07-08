import { useEffect, useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'
import {
  createTableObjectFromType,
  findReferenceTableForShape,
  resolveTableSizeForNewTable,
} from '../models/floorPlanObject'
import { floorBoundaryService } from '../services/FloorBoundaryService'

const BASIC_TABLE_SHAPES = new Set(['round', 'square', 'rectangle'])

function TableTypePreview({ preview }) {
  return (
    <span className={`fpb-component-preview preview-${preview}`} aria-hidden="true" />
  )
}

export function BuilderToolbox() {
  const {
    dispatch,
    state,
    activeFloor,
    activeWorkspaceBounds,
  } = useFloorPlanBuilder()
  const { floors } = state
  const [newAreaName, setNewAreaName] = useState('')
  const [renameValue, setRenameValue] = useState(activeFloor?.label ?? '')
  const [preferredShape, setPreferredShape] = useState('round')

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

  const placeTable = (tableType, position) => {
    const shape = tableType.shape ?? 'round'
    const referenceTable = findReferenceTableForShape({
      objects: state.objects,
      shape,
      floorId: state.activeFloorId,
      selectedTableIds: state.selectedTableIds,
    })
    const size = resolveTableSizeForNewTable(shape, referenceTable)
    const centeredPosition = position ?? floorBoundaryService.clampToFloor(
      {
        x: activeWorkspaceBounds.x + (activeWorkspaceBounds.width / 2) - (size.width / 2),
        y: activeWorkspaceBounds.y + (activeWorkspaceBounds.height / 2) - (size.height / 2),
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
    })

    dispatch({ type: 'ADD_OBJECT', payload: { object } })
  }

  const handleQuickAddTable = () => {
    const tableType = TABLE_TYPES.find((entry) => entry.shape === preferredShape)
      ?? TABLE_TYPES.find((entry) => entry.shape === 'round')
      ?? TABLE_TYPES[0]
    placeTable(tableType)
  }

  const isEditing = state.mode === 'editing'
  const basicTableTypes = TABLE_TYPES.filter((tableType) => BASIC_TABLE_SHAPES.has(tableType.shape))

  return (
    <aside className={`fpb-toolbox fpb-toolbox-simple${isEditing ? '' : ' is-locked'}`} aria-label="Floor plan builder">
      <div className="fpb-panel-header">
        <p className="fpb-panel-eyebrow">Restaurant</p>
        <h2 className="fpb-panel-title">Areas</h2>
      </div>

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
        <p className="fpb-panel-eyebrow">Tables</p>
        <h2 className="fpb-panel-title">Add tables</h2>
      </div>

      <div className="fpb-toolbox-quick-add">
        <label className="fpb-area-field">
          <span>Default shape</span>
          <select
            className="fpb-inspector-select"
            value={preferredShape}
            onChange={(event) => setPreferredShape(event.target.value)}
            disabled={!isEditing}
          >
            {basicTableTypes.map((tableType) => (
              <option key={tableType.id} value={tableType.shape}>{tableType.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="fpb-toolbox-add-table-btn"
          onClick={handleQuickAddTable}
          disabled={!isEditing}
        >
          + Add table
        </button>
      </div>

      <div className="fpb-toolbox-table-list">
        {TABLE_TYPES.map((tableType) => {
          const isSelected = state.toolboxSelectionId === tableType.id

          return (
            <button
              key={tableType.id}
              type="button"
              className={`fpb-toolbox-item fpb-table-type-btn${isSelected ? ' is-selected' : ''}`}
              disabled={!isEditing}
              onClick={() => {
                if (!isEditing) return
                dispatch({
                  type: 'SELECT_TOOLBOX_ITEM',
                  payload: { itemId: tableType.id },
                })
              }}
            >
              <TableTypePreview preview={tableType.preview} />
              <span className="fpb-toolbox-item-copy">
                <span className="fpb-toolbox-item-icon" aria-hidden="true">{tableType.icon}</span>
                <span className="fpb-toolbox-item-label">{tableType.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="fpb-toolbox-hint">
        {isEditing
          ? <>Tap <strong>Add table</strong> or pick a shape, then tap the floor in <strong>{activeFloor?.label}</strong>.</>
          : 'Layout is locked in view mode. Click Edit layout to make changes.'}
      </p>
    </aside>
  )
}
