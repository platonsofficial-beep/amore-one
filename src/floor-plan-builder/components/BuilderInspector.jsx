import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { getTableInspectorModel } from '../models/inspectorSchema'
import { FLOOR_PLAN_OBJECT_TYPES, getObjectDisplayLabel } from '../models/floorPlanObject'

function InspectorField({ label, value, type = 'text' }) {
  return (
    <label className="fpb-inspector-field">
      <span>{label}</span>
      {type === 'checkbox' ? (
        <div className="fpb-inspector-checkbox">
          <input type="checkbox" checked={Boolean(value)} readOnly disabled tabIndex={-1} />
          <span>{value ? 'Yes' : 'No'}</span>
        </div>
      ) : (
        <input type="text" value={value} readOnly tabIndex={-1} />
      )}
    </label>
  )
}

function InspectorEmptyState() {
  return (
    <div className="fpb-inspector-empty">
      <div className="fpb-inspector-empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 80 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect
            x="8"
            y="14"
            width="52"
            height="40"
            rx="6"
            stroke="rgba(212, 175, 55, 0.28)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <rect
            x="22"
            y="26"
            width="24"
            height="16"
            rx="4"
            fill="rgba(242, 235, 224, 0.08)"
            stroke="rgba(212, 175, 55, 0.45)"
            strokeWidth="1.5"
          />
          <path
            d="M58 10 L68 20 M68 10 L58 20"
            stroke="rgba(212, 175, 55, 0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="62" cy="48" r="3" fill="rgba(212, 175, 55, 0.5)" />
          <path
            d="M62 51 L62 58 M59 55 L62 58 L65 55"
            stroke="rgba(212, 175, 55, 0.4)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="fpb-inspector-empty-title">Nothing selected yet</p>
      <p className="fpb-inspector-empty-copy">
        Click a table or object on the floor plan to view and edit its properties here.
      </p>
    </div>
  )
}

export function BuilderInspector() {
  const { selectedObject } = useFloorPlanBuilder()

  if (!selectedObject) {
    return (
      <aside className="fpb-inspector" aria-label="Inspector">
        <div className="fpb-panel-header">
          <p className="fpb-panel-eyebrow">Properties</p>
          <h2 className="fpb-panel-title">Inspector</h2>
        </div>
        <InspectorEmptyState />
      </aside>
    )
  }

  const isTable = selectedObject.type === FLOOR_PLAN_OBJECT_TYPES.TABLE
  const tableModel = isTable ? getTableInspectorModel(selectedObject) : null

  return (
    <aside className="fpb-inspector" aria-label="Inspector">
      <div className="fpb-panel-header">
        <p className="fpb-panel-eyebrow">Properties</p>
        <h2 className="fpb-panel-title">{getObjectDisplayLabel(selectedObject)}</h2>
      </div>

      <div className="fpb-inspector-fields">
        {isTable && tableModel ? (
          <>
            <InspectorField label="Name" value={tableModel.name} />
            <InspectorField label="Capacity" value={String(tableModel.capacity)} />
            <InspectorField label="Shape" value={tableModel.shape} />
            <InspectorField label="Width" value={`${tableModel.width}px`} />
            <InspectorField label="Height" value={`${tableModel.height}px`} />
            <InspectorField label="Rotation" value={`${tableModel.rotation}°`} />
            <InspectorField label="Locked" value={tableModel.locked} type="checkbox" />
            <InspectorField label="Visible" value={tableModel.visible} type="checkbox" />
          </>
        ) : (
          <>
            <InspectorField label="Type" value={selectedObject.type} />
            <InspectorField label="Width" value={`${Math.round(selectedObject.size.width)}px`} />
            <InspectorField label="Height" value={`${Math.round(selectedObject.size.height)}px`} />
            <InspectorField label="Rotation" value={`${selectedObject.rotation}°`} />
            <InspectorField label="Visible" value={selectedObject.properties.visible !== false} type="checkbox" />
          </>
        )}
      </div>

      <div className="fpb-inspector-actions">
        <button type="button" className="fpb-inspector-secondary-btn" disabled>
          Duplicate
        </button>
        <button type="button" className="fpb-inspector-danger-btn" disabled>
          Delete
        </button>
      </div>
    </aside>
  )
}
