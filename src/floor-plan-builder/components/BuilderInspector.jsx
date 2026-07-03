import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'
import { FLOOR_PLAN_OBJECT_TYPES, getObjectDisplayLabel } from '../models/floorPlanObject'
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
        Click a table on the floor to edit its name, seats, type, and area.
      </p>
    </div>
  )
}

export function BuilderInspector() {
  const { state, dispatch, selectedObject } = useFloorPlanBuilder()
  const { floors } = state

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

  const { properties } = selectedObject
  const tableNumber = properties.tableNumber ?? ''
  const capacity = properties.capacity ?? 4
  const shape = properties.shape ?? 'round'
  const floorId = selectedObject.floorId
  const width = Math.round(selectedObject.size.width)
  const height = Math.round(selectedObject.size.height)
  const rotation = Math.round(normalizeRotation(selectedObject.rotation ?? 0))
  const sections = properties.sections ?? []
  const showSections = supportsTableSections(shape, floorId)
  const sectionTotals = getTableSectionTotals(sections)

  const updateTable = (patch) => {
    dispatch({
      type: 'UPDATE_TABLE',
      payload: { objectId: selectedObject.id, patch },
    })
  }

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete table ${tableNumber || ''}?`)
    if (!confirmed) return

    dispatch({
      type: 'DELETE_OBJECT',
      payload: { objectId: selectedObject.id },
    })
  }

  return (
    <aside className="fpb-inspector fpb-inspector-simple" aria-label="Table properties">
      <div className="fpb-panel-header">
        <p className="fpb-panel-eyebrow">Properties</p>
        <h2 className="fpb-panel-title">{getObjectDisplayLabel(selectedObject)}</h2>
      </div>

      <div className="fpb-inspector-fields">
        <label className="fpb-inspector-field">
          <span>Table number</span>
          <input
            type="text"
            value={tableNumber}
            onChange={(event) => updateTable({ tableNumber: event.target.value })}
            placeholder="e.g. 12"
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Seats</span>
          <input
            type="number"
            min="1"
            max="24"
            value={showSections ? sectionTotals.stools : capacity}
            onChange={(event) => updateTable({ capacity: event.target.value })}
            disabled={showSections}
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
          <span>Table type</span>
          <select
            className="fpb-inspector-select"
            value={shape}
            onChange={(event) => updateTable({ shape: event.target.value })}
          >
            {TABLE_TYPES.map((tableType) => (
              <option key={tableType.id} value={tableType.shape}>
                {tableType.label}
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
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Height</span>
          <input
            type="number"
            min="1"
            value={height}
            onChange={(event) => updateTable({ height: event.target.value })}
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
          />
        </label>

        <label className="fpb-inspector-field">
          <span>Area</span>
          <select
            className="fpb-inspector-select"
            value={floorId}
            onChange={(event) => updateTable({ floorId: event.target.value })}
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
        >
          Delete table
        </button>
      </div>
    </aside>
  )
}
