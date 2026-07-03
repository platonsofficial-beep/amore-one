import { useEffect, useState } from 'react'
import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'

function TableTypePreview({ preview }) {
  return (
    <span className={`fpb-component-preview preview-${preview}`} aria-hidden="true" />
  )
}

export function BuilderToolbox() {
  const { dispatch, state, activeFloor } = useFloorPlanBuilder()
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

  return (
    <aside className="fpb-toolbox fpb-toolbox-simple" aria-label="Floor plan builder">
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
          />
        </label>
        <button
          type="button"
          className="fpb-area-action-btn"
          onClick={handleRenameArea}
          disabled={!renameValue.trim() || renameValue.trim() === activeFloor?.label}
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
          />
        </label>
        <button
          type="button"
          className="fpb-area-action-btn"
          onClick={handleCreateArea}
          disabled={!newAreaName.trim()}
        >
          Create area
        </button>

        <button
          type="button"
          className="fpb-area-action-btn fpb-area-action-btn-danger"
          onClick={handleDeleteArea}
          disabled={floors.length <= 1}
        >
          Delete area
        </button>
      </div>

      <div className="fpb-panel-header fpb-panel-header-spaced">
        <p className="fpb-panel-eyebrow">Tables</p>
        <h2 className="fpb-panel-title">Add a table</h2>
      </div>

      <div className="fpb-toolbox-table-list">
        {TABLE_TYPES.map((tableType) => {
          const isSelected = state.toolboxSelectionId === tableType.id

          return (
            <button
              key={tableType.id}
              type="button"
              className={`fpb-toolbox-item fpb-table-type-btn${isSelected ? ' is-selected' : ''}`}
              onClick={() => dispatch({
                type: 'SELECT_TOOLBOX_ITEM',
                payload: { itemId: tableType.id },
              })}
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
        Select a table type, then click the floor in <strong>{activeFloor?.label}</strong> to place it.
      </p>
    </aside>
  )
}
