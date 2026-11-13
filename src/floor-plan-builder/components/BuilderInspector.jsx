import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { TABLE_TYPES } from '../models/componentCatalog'
import {
  FLOOR_PLAN_OBJECT_TYPES,
  buildTableSizePresetPatch,
  formatBuilderTableLabel,
  getObjectDisplayLabel,
  matchTableSizePreset,
  normalizeTableGuestRange,
  resolveTableGuestRange,
  TABLE_CAPACITY_MAX,
  TABLE_CAPACITY_MIN,
  TABLE_SIZE_PRESET_LABELS,
  TABLE_SIZE_PRESET_ROWS,
} from '../models/floorPlanObject'
import {
  buildTableSizeResetPatch,
  canDecreaseTableDimension,
  normalizeTableSize,
} from '../lib/tableDimensions'
import { getTableMinSize, normalizeRotation, stepRotation } from '../lib/tableTransformUtils'
import {
  createDefaultSections,
  getTableSectionTotals,
  normalizeTableSection,
  supportsTableSections,
} from '../lib/tableSections'
import { PanelHeader } from './PanelHeader'
import { t } from '../../i18n/i18n'

const TABLE_ROTATION_STEP = 45

function InspectorEmptyState() {
  return (
    <div className="fpb-inspector-empty">
      <p className="fpb-inspector-empty-title">{t("No table selected")}</p>
      <p className="fpb-inspector-empty-copy">
        {t("Tap a table to edit its properties. Tap empty space to clear selection.")}
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
        {t("Click another table to add it. Click a selected table again to remove it.")}
      </p>
      <div className="fpb-inspector-actions">
        <button
          type="button"
          className="fpb-inspector-secondary-btn"
          onClick={handleAlignHorizontal}
          disabled={isReadOnly || count < 2}
        >
          {t("Align horizontal")}
        </button>
        <button
          type="button"
          className="fpb-inspector-secondary-btn"
          onClick={handleAlignVertical}
          disabled={isReadOnly || count < 2}
        >
          {t("Align vertical")}
        </button>
        <button
          type="button"
          className="fpb-inspector-secondary-btn"
          onClick={handleMatchSize}
          disabled={isReadOnly || count < 2}
        >
          {t("Match size")}
        </button>
        <button
          type="button"
          className="fpb-inspector-danger-btn"
          onClick={handleDelete}
          disabled={isReadOnly}
        >
          {t("Delete selected")}
        </button>
      </div>
    </div>
  )
}

export function BuilderInspector({
  onClose,
  showCloseButton = false,
  isTabletLayout = false,
  closeLabel = 'Close panel',
}) {
  const { state, dispatch, selectedObject } = useFloorPlanBuilder()
  const { floors } = state
  const isReadOnly = state.mode !== 'editing'
  const selectionCount = state.selectedTableIds.length
  const showMultiSelectPanel = state.multiSelectEnabled && selectionCount > 1

  if (showMultiSelectPanel) {
    return (
      <aside className="fpb-inspector fpb-inspector-simple" aria-label={t("Table properties")}>
        <PanelHeader
          eyebrow="Properties"
          title={`${selectionCount} tables selected`}
          onClose={onClose}
          showClose={showCloseButton}
          closeLabel={closeLabel}
        />
        <InspectorMultiSelectPanel count={selectionCount} isReadOnly={isReadOnly} dispatch={dispatch} />
      </aside>
    )
  }

  if (!selectedObject || selectedObject.type !== FLOOR_PLAN_OBJECT_TYPES.TABLE) {
    return (
      <aside className="fpb-inspector fpb-inspector-simple" aria-label={t("Table properties")}>
        <PanelHeader
          eyebrow="Properties"
          title={t("Table")}
          onClose={onClose}
          showClose={showCloseButton}
          closeLabel={closeLabel}
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
  const minSize = getTableMinSize(shape)
  const normalizedSize = normalizeTableSize(selectedObject.size, shape)
  const width = normalizedSize.width
  const height = normalizedSize.height
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
  const activeSizePreset = matchTableSizePreset(shape, { width, height })

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
    <aside className={`fpb-inspector fpb-inspector-simple${isReadOnly ? ' is-readonly' : ''}`} aria-label={t("Table properties")}>
      <PanelHeader
        eyebrow="Properties"
        title={displayLabel}
        onClose={onClose}
        showClose={showCloseButton}
        closeLabel={closeLabel}
      >
        {isReadOnly ? <p className="fpb-inspector-readonly-note">{t("View mode — click Edit layout to change tables.")}</p> : null}
      </PanelHeader>

      <div className="fpb-inspector-fields">
        <label className="fpb-inspector-field">
          <span>{t("Table name")}</span>
          <input
            type="text"
            value={tableNumber}
            onChange={(event) => updateTable({ tableNumber: event.target.value })}
            placeholder={t("e.g. T1")}
            disabled={isReadOnly}
          />
        </label>

        <label className="fpb-inspector-field">
          <span>{t("Minimum guests")}</span>
          <div className="fpb-inspector-stepper">
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests - 1, maxGuests)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || minGuests <= TABLE_CAPACITY_MIN}
              aria-label={t("Decrease minimum guests")}
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
              aria-label={t("Minimum guests")}
            />
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests + 1, maxGuests)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || minGuests >= maxGuests || minGuests >= TABLE_CAPACITY_MAX}
              aria-label={t("Increase minimum guests")}
            >
              +
            </button>
          </div>
        </label>

        <label className="fpb-inspector-field">
          <span>{t("Maximum guests")}</span>
          <div className="fpb-inspector-stepper">
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests, maxGuests - 1)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || maxGuests <= minGuests || maxGuests <= TABLE_CAPACITY_MIN}
              aria-label={t("Decrease maximum guests")}
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
              aria-label={t("Maximum guests")}
            />
            <button
              type="button"
              className="fpb-inspector-stepper-btn"
              onClick={() => {
                const next = normalizeTableGuestRange(minGuests, maxGuests + 1)
                updateTable({ minGuests: next.minGuests, maxGuests: next.maxGuests })
              }}
              disabled={showSections || isReadOnly || maxGuests >= TABLE_CAPACITY_MAX}
              aria-label={t("Increase maximum guests")}
            >
              +
            </button>
          </div>
        </label>

        {showSections ? (
          <div className="fpb-inspector-sections">
            <div className="fpb-inspector-sections-header">
              <span>{t("Sections")}</span>
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
                {t("Add section")}
              </button>
            </div>

            {sections.length === 0 ? (
              <button
                type="button"
                className="fpb-inspector-sections-seed"
                onClick={() => updateTable({ sections: createDefaultSections(shape, floorId) })}
              >
                {t("Add default sections")}
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
                  placeholder={t("Label")}
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
                  aria-label={t("Stools")}
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
                  aria-label={t("Max guests")}
                />
                <button
                  type="button"
                  className="fpb-inspector-section-remove"
                  onClick={() => updateTable({
                    sections: sections.filter((_, entryIndex) => entryIndex !== index),
                  })}
                  aria-label={t("Remove section")}
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
          <span>{t("Shape")}</span>
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

        <div className="fpb-inspector-size-presets" aria-label={t("Table size presets")}>
          <div className="fpb-inspector-size-presets-header">
            <span className="fpb-inspector-size-presets-label">{t("Quick size")}</span>
            <span
              className={`fpb-inspector-size-presets-status${activeSizePreset ? '' : ' is-custom'}`}
              aria-live="polite"
            >
              {activeSizePreset ? TABLE_SIZE_PRESET_LABELS[activeSizePreset] : 'Custom'}
            </span>
          </div>
          <div className="fpb-inspector-size-presets-grid">
            {TABLE_SIZE_PRESET_ROWS.map((row, rowIndex) => (
              <div key={`preset-row-${rowIndex}`} className="fpb-inspector-size-presets-row">
                {row.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`fpb-inspector-size-preset-btn${activeSizePreset === preset ? ' is-active' : ''}`}
                    onClick={() => {
                      updateTable(buildTableSizePresetPatch(shape, preset))
                    }}
                    disabled={isReadOnly}
                    aria-pressed={activeSizePreset === preset}
                  >
                    {TABLE_SIZE_PRESET_LABELS[preset]}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="fpb-inspector-size-reset-btn"
            onClick={() => updateTable(buildTableSizeResetPatch(shape))}
            disabled={isReadOnly}
          >
            {t("Reset size")}
          </button>
        </div>

        {!isTabletLayout ? (
        <div className="fpb-inspector-dimension-controls">
          <label className="fpb-inspector-field">
            <span>{t("Width")}</span>
            <div className="fpb-inspector-stepper">
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ width: width - 8 })}
                disabled={isReadOnly || !canDecreaseTableDimension(width, -8, shape, 'width')}
                aria-label={t("Decrease width")}
              >
                −
              </button>
              <input
                type="number"
                min={minSize.width}
                value={width}
                onChange={(event) => updateTable({ width: event.target.value })}
                disabled={isReadOnly}
              />
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ width: width + 8 })}
                disabled={isReadOnly}
                aria-label={t("Increase width")}
              >
                +
              </button>
            </div>
          </label>

          <label className="fpb-inspector-field">
            <span>{t("Height")}</span>
            <div className="fpb-inspector-stepper">
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ height: height - 8 })}
                disabled={isReadOnly || !canDecreaseTableDimension(height, -8, shape, 'height')}
                aria-label={t("Decrease height")}
              >
                −
              </button>
              <input
                type="number"
                min={minSize.height}
                value={height}
                onChange={(event) => updateTable({ height: event.target.value })}
                disabled={isReadOnly}
              />
              <button
                type="button"
                className="fpb-inspector-stepper-btn"
                onClick={() => updateTable({ height: height + 8 })}
                disabled={isReadOnly}
                aria-label={t("Increase height")}
              >
                +
              </button>
            </div>
          </label>
        </div>
        ) : null}

        <div className="fpb-inspector-field">
          <span>{t("Rotation")}</span>
          <div className="fpb-inspector-rotation-controls">
            <button
              type="button"
              className="fpb-inspector-rotation-btn"
              onClick={() => updateTable({ rotation: stepRotation(rotation, -TABLE_ROTATION_STEP) })}
              disabled={isReadOnly}
              aria-label={t("Rotate left 45 degrees")}
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
              aria-label={t("Rotation degrees")}
            />
            <button
              type="button"
              className="fpb-inspector-rotation-btn"
              onClick={() => updateTable({ rotation: stepRotation(rotation, TABLE_ROTATION_STEP) })}
              disabled={isReadOnly}
              aria-label={t("Rotate right 45 degrees")}
            >
              Right ↻
            </button>
          </div>
        </div>

        <label className="fpb-inspector-field">
          <span>{t("Area")}</span>
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
          {t("Delete table")}
        </button>
      </div>
    </aside>
  )
}
