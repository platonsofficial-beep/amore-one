import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { formatZoomPercent } from '../hooks/useCanvasViewport'

function BuilderToolbarButton({
  children,
  onClick,
  disabled = false,
  className = '',
  title,
}) {
  return (
    <button
      type="button"
      className={`fpb-toolbar-btn${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

export function BuilderToolbar({
  onBack,
  onZoomIn,
  onZoomOut,
}) {
  const { state, dispatch, activeFloor } = useFloorPlanBuilder()
  const zoomLabel = formatZoomPercent(state.viewport.zoom)

  return (
    <header className="fpb-toolbar" aria-label="Floor plan builder toolbar">
      <div className="fpb-toolbar-section fpb-toolbar-section-start">
        <BuilderToolbarButton onClick={onBack} title="Back to workspace">
          ← Back
        </BuilderToolbarButton>

        <div className="fpb-toolbar-divider" aria-hidden="true" />

        <label className="fpb-floor-select">
          <span className="sr-only">Active floor</span>
          <select
            className="fpb-floor-select-input"
            value={state.activeFloorId}
            onChange={(event) => dispatch({
              type: 'SET_ACTIVE_FLOOR',
              payload: { floorId: event.target.value },
            })}
          >
            {state.floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.label}</option>
            ))}
          </select>
          <span className="fpb-floor-select-chevron" aria-hidden="true">▾</span>
        </label>
      </div>

      <div className="fpb-toolbar-section fpb-toolbar-section-center">
        <span className="fpb-mode-badge">Editing</span>
        <BuilderToolbarButton disabled title="Preview — coming soon">
          Preview
        </BuilderToolbarButton>
        <BuilderToolbarButton
          disabled
          className="fpb-toolbar-btn-primary"
          title="Publish — coming soon"
        >
          Publish
        </BuilderToolbarButton>
      </div>

      <div className="fpb-toolbar-section fpb-toolbar-section-end">
        <BuilderToolbarButton disabled title="Undo — coming soon">Undo</BuilderToolbarButton>
        <BuilderToolbarButton disabled title="Redo — coming soon">Redo</BuilderToolbarButton>

        <div className="fpb-toolbar-divider" aria-hidden="true" />

        <div className="fpb-zoom-cluster" aria-label="Zoom controls">
          <BuilderToolbarButton onClick={onZoomOut} title="Zoom out">−</BuilderToolbarButton>
          <span className="fpb-zoom-label">{zoomLabel}</span>
          <BuilderToolbarButton onClick={onZoomIn} title="Zoom in">+</BuilderToolbarButton>
        </div>
      </div>

      <span className="sr-only">Current floor: {activeFloor.label}</span>
    </header>
  )
}
