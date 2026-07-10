import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'
import {
  FLOOR_PLAN_OBJECT_TYPES,
  adjustTableDimension,
  buildTableSizePresetPatch,
  formatBuilderTableLabel,
  getObjectDisplayLabel,
  normalizeTableGuestRange,
  resolveTableGuestRange,
  TABLE_CAPACITY_MAX,
  TABLE_CAPACITY_MIN,
} from '../models/floorPlanObject'
import { normalizeRotation, stepRotation } from '../lib/tableTransformUtils'
import {
  createDefaultSections,
  getTableSectionTotals,
  normalizeTableSection,
  supportsTableSections,
} from '../lib/tableSections'
import { PanelHeader } from './PanelHeader'

const TABLE_ROTATION_STEP = 45

function InspectorEmptyState() {
  return (
    <div className="fpb-inspector-empty">
      <p className="fpb-inspector-empty-title">No table selected</p>
      <p className="fpb-inspector-empty-copy">
        Tap a table to edit its properties. Tap empty space to clear selection.
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

export function BuilderInspector({ onClose, showCloseButton = false }) {
  const { state, dispatch, selectedObject } = useFloorPlanBuilder()
  const { floors } = state
  const isReadOnly = state.mode !== 'editing'
  const selectionCount = state.selectedTableIds.length
  const showMultiSelectPanel = state.multiSelectEnabled && selectionCount > 1

  if (showMultiSelectPanel) {
    return (
      <aside className="fpb-inspector fpb-inspector-simple" aria-label="Table properties">
        <PanelHeader
          eyebrow="Properties"
          title={`${selectionCount} tables selected`}
          onClose={onClose}
          showClose={showCloseButton}
        />
        <InspectorMultiSelectPanel count={selectionCount} isReadOnly={isReadOnly} dispatch={dispatch} />
      </aside>
    )
  }

  if (!selectedObject || selectedObject.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return (
      <aside className="fpb-inspector fpb-inspector-simple" aria-label="Table properties">
        <PanelHeader
          eyebrow="Properties"
          title="Table"
          onClose={onClose}
          showClose={showCloseButton}
        />
        <InspectorEmptyState />
      </aside>
    )
  }

  const properties = selectedObject.properties ?? {}
  const tableNumber = properties.tableNumber ?? properties.name ?? ''
  const guestRange = resolveTableGuestRange(properties, properties.shape ?? 'round')
  const minGuests = guestRange.minGuests
  const maxGuests = guestRange.maxGuests
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
      <PanelHeader
        eyebrow="Properties"
        title={displayLabel}
        onClose={onClose}
        showClose={showCloseButton}
      >
        {isReadOnly ? <p className="fpb-inspector-readonly-note">View mode — click Edit layout to change tables.</p> : null}
      </PanelHeader>

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
          <span>Minimum guests</span>
          <div className="fpb-inspector-stepper">
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests - 1, maxGuests)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || minGuests <= TABLE_CAPACITY_MIN}
              aria-label="Decrease minimum guests"
            >
              −
            </button>
            <input
              type="number"
              min={TABLE_CAPACITY_MIN}
              max={TABLE_CAPACITY_MAX}
              value={showSections ? sectionTotals.stools : minGuests}
              onChange={(event) => {
                const next = normalizeTableGuestRange(event.target.value, maxGuests)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly}
              aria-label="Minimum guests"
            />
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests + 1, maxGuests)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || minGuests >= maxGuests || minGuests >= TABLE_CAPACITY_MAX}
              aria-label="Increase minimum guests"
            >
              +
            </button>
          </div>
        </label>

        <label className="fpb-inspector-field">
          <span>Maximum guests</span>
          <div className="fpb-inspector-stepper">
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests, maxGuests - 1)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || maxGuests <= minGuests || maxGuests <= TABLE_CAPACITY_MIN}
              aria-label="Decrease maximum guests"
            >
              −
            </button>
            <input
              type="number"
              min={TABLE_CAPACITY_MIN}
              max={TABLE_CAPACITY_MAX}
              value={showSections ? sectionTotals.maxGuests : maxGuests}
              onChange={(event) => {
                const next = normalizeTableGuestRange(minGuests, event.target.value)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly}
              aria-label="Maximum guests"
            />
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests, maxGuests + 1)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || maxGuests >= TABLE_CAPACITY_MAX}
              aria-label="Increase maximum guests"
            >
              +
            </button>
          </div>
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

        <div className="fpb-inspector-size-presets" aria-label="Table size presets">
          <span className="fpb-inspector-size-presets-label">Quick size</span>
          <div className="fpb-inspector-size-presets-row">
            {['small', 'medium', 'large'].map((preset) => (
              <button
                key={preset}
                type="button"
                className="fpb-inspector-size-preset-btn"
                onClick={() => {
                  updateTable(buildTableSizePresetPatch(shape, preset))
                }}
                disabled={isReadOnly}
              >
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="fpb-inspector-dimension-controls">
          <label className="fpb-inspector-field">
            <span>Width</span>
            <div className="fpb-inspector-stepper">
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ width: adjustTableDimension(width, -8) })}
                disabled={isReadOnly}
                aria-label="Decrease width"
              >
                −
              </button>
              <input
                type="number"
                min="1"
                value={width}
                onChange={(event) => updateTable({ width: event.target.value })}
                disabled={isReadOnly}
              />
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ width: adjustTableDimension(width, 8) })}
                disabled={isReadOnly}
                aria-label="Increase width"
              >
                +
              </button>
            </div>
          </label>

          <label className="fpb-inspector-field">
            <span>Height</span>
            <div className="fpb-inspector-stepper">
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ height: adjustTableDimension(height, -8) })}
                disabled={isReadOnly}
                aria-label="Decrease height"
              >
                −
              </button>
              <input
                type="number"
                min="1"
                value={height}
                onChange={(event) => updateTable({ height: event.target.value })}
                disabled={isReadOnly}
              />
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ height: adjustTableDimension(height, 8) })}
                disabled={isReadOnly}
                aria-label="Increase height"
              >
                +
              </button>
            </div>
          </label>
        </div>

        <div className="fpb-inspector-field">
          <span>Rotation</span>
          <div className="fpb-inspector-rotation-controls">
            <button
              type="button"
              className="fpb-inspector-rotation-btn"
              onClick={() => updateTable({ rotation: stepRotation(rotation, -TABLE_ROTATION_STEP) })}
              disabled={isReadOnly}
              aria-label="Rotate left 45 degrees"
            >
              ↺ Left
            </button>
            <input
              type="number"
              className="fpb-inspector-rotation-input"
              min="0"
              max="359"
              value={rotation}
              onChange={(event) => updateTable({ rotation: event.target.value })}
              disabled={isReadOnly}
              aria-label="Rotation degrees"
            />
            <button
              type="button"
              className="fpb-inspector-rotation-btn"
              onClick={() => updateTable({ rotation: stepRotation(rotation, TABLE_ROTATION_STEP) })}
              disabled={isReadOnly}
              aria-label="Rotate right 45 degrees"
            >
              Right ↻
            </button>
          </div>
        </div>

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
