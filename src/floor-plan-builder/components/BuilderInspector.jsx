import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'
import {
  FLOOR_PLAN_OBJECT_TYPES,
  formatBuilderTableLabel,
  getObjectDisplayLabel,
} from '../models/floorPlanObject'
import { normalizeRotation } from '../lib/tableTransformUtils'
import {
  createDefaultSections,
  getTableSectionTotals,
  normalizeTableSection,
  supportsTableSections,
} from '../lib/tableSections'

function InspectorEmptyState() {
  return (
    <div className="fpb-inspector-empty">
      <p className="fpb-inspector-empty-title">No table selected</p>
      <p className="fpb-inspector-empty-copy">
        Click tables on the floor to add them to the selection. Click empty space to clear.
      </p>
    </div>
  )
}

function InspectorMultiSelectPanel({ count, isReadOnly, dispatch }) {
  const handleAlignHorizontal = () => {
    if (count < 2) return
    dispatch({ type: 'ALIGN_SELECTED_HORIZONTAL' })
  }

  const handleAlignVertical = () => {
    if (count < 2) return
    dispatch({ type: 'ALIGN_SELECTED_VERTICAL' })
  }

  const handleMatchSize = () => {
    if (count < 2) return
    dispatch({ type: 'MATCH_SELECTED_TABLE_SIZE' })
  }

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete ${count} selected tables?`)
    if (!confirmed) return
    dispatch({ type: 'DELETE_SELECTED_TABLES' })
  }

  return (
    <div className="fpb-inspector-multi-actions">
      <p className="fpb-inspector-empty-copy">
        Click another table to add it. Click a selected table again to remove it.
      </p>
      <div className="fpb-inspector-actions">
        <button
          type="button"
          className="fpb-inspector-secondary-btn"
          onClick={handleAlignHorizontal}
          disabled={isReadOnly || count < 2}
        >
          Align horizontal
        </button>
        <button
          type="button"
          className="fpb-inspector-secondary-btn"
          onClick={handleAlignVertical}
          disabled={isReadOnly || count < 2}
        >
          Align vertical
        </button>
        <button
          type="button"
          className="fpb-inspector-secondary-btn"
          onClick={handleMatchSize}
          disabled={isReadOnly || count < 2}
        >
          Match size
        </button>
        <button
          type="button"
          className="fpb-inspector-danger-btn"
          onClick={handleDelete}
          disabled={isReadOnly}
        >
          Delete selected
        </button>
      </div>
    </div>
  )
}

export function BuilderInspector() {
  const { state, dispatch, selectedObject } = useFloorPlanBuilder()
  const { floors } = state
  const isReadOnly = state.mode !== 'editing'
  const selectionCount = state.selectedTableIds.length

  if (selectionCount > 1) {
    return (
      <aside className="fpb-inspector fpb-inspector-simple" aria-label="Table properties">
        <div className="fpb-panel-header">
          <p className="fpb-panel-eyebrow">Properties</p>
          <h2 className="fpb-panel-title">{selectionCount} tables selected</h2>
        </div>
        <InspectorMultiSelectPanel count={selectionCount} isReadOnly={isReadOnly} dispatch={dispatch} />
      </aside>
    )
  }

  if (!selectedObject || selectedObject.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return (
      <aside className="fpb-inspector fpb-inspector-simple" aria-label="Table properties">
        <div className="fpb-panel-header">
          <p className="fpb-panel-eyebrow">Properties</p>
          <h2 className="fpb-panel-title">Table</h2>
        </div>
        <InspectorEmptyState />
      </aside>
    )
  }

  const properties = selectedObject.properties ?? {}
  const tableNumber = properties.tableNumber ?? properties.name ?? ''
  const capacity = Math.max(1, Number(properties.capacity) || 2)
  const shape = properties.shape ?? 'round'
  const floorId = selectedObject.floorId ?? state.activeFloorId
  const objectSize = selectedObject.size ?? {}
  const width = Math.max(1, Math.round(Number(objectSize.width) || 1))
  const height = Math.max(1, Math.round(Number(objectSize.height) || 1))
  const rotation = Math.round(normalizeRotation(selectedObject.rotation ?? 0))
  const sections = Array.isArray(properties.sections) ? properties.sections : []
  const showSections = supportsTableSections(shape, floorId)
  const sectionTotals = getTableSectionTotals(sections)
  const basicTableTypes = TABLE_TYPES.filter((tableType) => (
    ['round', 'square', 'rectangle'].includes(tableType.shape)
  ))
  const displayLabel = getObjectDisplayLabel(selectedObject)
    || formatBuilderTableLabel(selectedObject)
    || 'Table'

  const updateTable = (patch) => {
    if (isReadOnly || !selectedObject?.id) return
    dispatch({
      type: 'UPDATE_TABLE',
      payload: { objectId: selectedObject.id, patch },
    })
  }

  const handleDelete = () => {
    if (isReadOnly) return
    const confirmed = window.confirm(`Delete table ${tableNumber || ''}?`)
    if (!confirmed) return

    dispatch({
      type: 'DELETE_OBJECT',
      payload: { objectId: selectedObject.id },
    })
  }

  return (
    <aside className={`fpb-inspector fpb-inspector-simple${isReadOnly ? ' is-readonly' : ''}`} aria-label="Table properties">
      <div className="fpb-panel-header">
        <p className="fpb-panel-eyebrow">Properties</p>
        <h2 className="fpb-panel-title">{displayLabel}</h2>
        {isReadOnly ? <p className="fpb-inspector-readonly-note">View mode — click Edit layout to change tables.</p> : null}
      </div>

      <div className="fpb-inspector-fields">
        <label className="fpb-inspector-field">
          <span>Table name</span>
          <input
            type="text"
            value={tableNumber}
            onChange={(event) => updateTable({ tableNumber: event.target.value })}
            placeholder="e.g. T1"
            disabled={isReadOnly}
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Guest capacity</span>
          <input
            type="number"
            min="1"
            max="24"
            value={showSections ? sectionTotals.stools : capacity}
            onChange={(event) => updateTable({ capacity: event.target.value })}
            disabled={showSections || isReadOnly}
          />
        </label>

        {showSections ? (
          <div className="fpb-inspector-sections">
            <div className="fpb-inspector-sections-header">
              <span>Sections</span>
              <button
                type="button"
                className="fpb-inspector-sections-add"
                onClick={() => {
                  const nextIndex = sections.length + 1
                  updateTable({
                    sections: [
                      ...sections,
                      normalizeTableSection({
                        id: `${nextIndex}`,
                        label: `${nextIndex}`,
                        stools: 2,
                        maxGuests: 4,
                      }),
                    ],
                  })
                }}
              >
                Add section
              </button>
            </div>

            {sections.length === 0 ? (
              <button
                type="button"
                className="fpb-inspector-sections-seed"
                onClick={() => updateTable({ sections: createDefaultSections(shape, floorId) })}
              >
                Add default sections
              </button>
            ) : null}

            {sections.map((section, index) => (
              <div key={`${section.id}-${index}`} className="fpb-inspector-section-row">
                <input
                  type="text"
                  value={section.label}
                  onChange={(event) => {
                    const nextSections = sections.map((entry, entryIndex) => (
                      entryIndex === index
                        ? normalizeTableSection({ ...entry, label: event.target.value })
                        : entry
                    ))
                    updateTable({ sections: nextSections })
                  }}
                  placeholder="Label"
                />
                <input
                  type="number"
                  min="1"
                  value={section.stools}
                  onChange={(event) => {
                    const nextSections = sections.map((entry, entryIndex) => (
                      entryIndex === index
                        ? normalizeTableSection({ ...entry, stools: event.target.value })
                        : entry
                    ))
                    updateTable({ sections: nextSections })
                  }}
                  aria-label="Stools"
                />
                <input
                  type="number"
                  min="1"
                  value={section.maxGuests}
                  onChange={(event) => {
                    const nextSections = sections.map((entry, entryIndex) => (
                      entryIndex === index
                        ? normalizeTableSection({ ...entry, maxGuests: event.target.value })
                        : entry
                    ))
                    updateTable({ sections: nextSections })
                  }}
                  aria-label="Max guests"
                />
                <button
                  type="button"
                  className="fpb-inspector-section-remove"
                  onClick={() => updateTable({
                    sections: sections.filter((_, entryIndex) => entryIndex !== index),
                  })}
                  aria-label="Remove section"
                >
                  ×
                </button>
              </div>
            ))}

            <p className="fpb-inspector-sections-summary">
              {sectionTotals.stools} stools · max {sectionTotals.maxGuests} guests
            </p>
          </div>
        ) : null}

        <label className="fpb-inspector-field">
          <span>Shape</span>
          <select
            className="fpb-inspector-select"
            value={shape}
            onChange={(event) => updateTable({ shape: event.target.value })}
            disabled={isReadOnly}
          >
            {basicTableTypes.map((tableType) => (
              <option key={tableType.id} value={tableType.shape}>
                {tableType.label.replace(' Table', '')}
              </option>
            ))}
          </select>
        </label>

        <label className="fpb-inspector-field">
          <span>Width</span>
          <input
            type="number"
            min="1"
            value={width}
            onChange={(event) => updateTable({ width: event.target.value })}
            disabled={isReadOnly}
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Height</span>
          <input
            type="number"
            min="1"
            value={height}
            onChange={(event) => updateTable({ height: event.target.value })}
            disabled={isReadOnly}
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Rotation</span>
          <input
            type="number"
            min="0"
            max="359"
            value={rotation}
            onChange={(event) => updateTable({ rotation: event.target.value })}
            disabled={isReadOnly}
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Area</span>
          <select
            className="fpb-inspector-select"
            value={floorId}
            onChange={(event) => updateTable({ floorId: event.target.value })}
            disabled={isReadOnly}
          >
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="fpb-inspector-actions">
        <button
          type="button"
          className="fpb-inspector-danger-btn"
          onClick={handleDelete}
          disabled={isReadOnly}
        >
          Delete table
        </button>
      </div>
    </aside>
  )
}
