import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { formatZoomPercent } from '../hooks/useCanvasViewport'

export function BuilderStatusBar() {
  const { state, objectCount } = useFloorPlanBuilder()

  return (
    <footer className="fpb-status-bar" aria-label="Builder status">
      <div className="fpb-status-group">
        <span className="fpb-status-item">
          <span className="fpb-status-label">Zoom</span>
          <strong>{formatZoomPercent(state.viewport.zoom)}</strong>
        </span>
        <span className="fpb-status-divider" aria-hidden="true" />
        <span className="fpb-status-item">
          <span className="fpb-status-label">Snap</span>
          <strong>{state.settings.snapEnabled ? 'ON' : 'OFF'}</strong>
        </span>
        <span className="fpb-status-divider" aria-hidden="true" />
        <span className="fpb-status-item">
          <span className="fpb-status-label">Grid</span>
          <strong>{state.settings.gridEnabled ? 'ON' : 'OFF'}</strong>
        </span>
      </div>

      <div className="fpb-status-group">
        <span className="fpb-status-item">
          <span className="fpb-status-label">Objects</span>
          <strong>{objectCount}</strong>
        </span>
        <span className="fpb-status-divider" aria-hidden="true" />
        <span className="fpb-status-item">
          <span className="fpb-status-label">Unsaved Changes</span>
          <strong>{state.hasUnsavedChanges ? 'Yes' : 'No'}</strong>
        </span>
      </div>
    </footer>
  )
}
