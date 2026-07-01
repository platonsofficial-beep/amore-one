import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { getInspectorFieldsForObject, INSPECTOR_EMPTY_MESSAGE } from '../models/inspectorSchema'
import { getObjectDisplayLabel } from '../models/floorPlanObject'

export function BuilderInspector() {
  const { selectedObject } = useFloorPlanBuilder()

  if (!selectedObject) {
    return (
      <aside className="fpb-inspector" aria-label="Inspector">
        <div className="fpb-panel-header">
          <p className="fpb-panel-eyebrow">Properties</p>
          <h2 className="fpb-panel-title">Inspector</h2>
        </div>
        <div className="fpb-inspector-empty">
          <p>{INSPECTOR_EMPTY_MESSAGE}</p>
        </div>
      </aside>
    )
  }

  const fields = getInspectorFieldsForObject(selectedObject)

  return (
    <aside className="fpb-inspector" aria-label="Inspector">
      <div className="fpb-panel-header">
        <p className="fpb-panel-eyebrow">Properties</p>
        <h2 className="fpb-panel-title">{getObjectDisplayLabel(selectedObject)}</h2>
      </div>

      <div className="fpb-inspector-fields">
        {fields.map((field) => (
          <label key={field.id} className={`fpb-inspector-field${field.disabled ? ' is-disabled' : ''}`}>
            <span>{field.label}</span>
            <input
              type="text"
              value={field.value}
              readOnly
              disabled={field.disabled}
              tabIndex={-1}
            />
          </label>
        ))}
      </div>

      <div className="fpb-inspector-actions">
        <button type="button" className="fpb-inspector-danger-btn" disabled>
          Delete
        </button>
      </div>
    </aside>
  )
}
