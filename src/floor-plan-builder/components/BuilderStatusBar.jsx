import { useFloorPlanBuilder } from '../hooks/useFloorPlanBuilder'
import { formatZoomPercent } from '../hooks/useCanvasViewport'
import { t } from '../../i18n/i18n'

export function BuilderStatusBar() {
  const { state, objectCount } = useFloorPlanBuilder()

  return (
    <footer className="fpb-status-bar" aria-label={t("Builder status")}>
      <div className="fpb-status-group">
        <span className="fpb-status-item">
          <span className="fpb-status-label">{t("Zoom")}</span>
          <strong>{formatZoomPercent(state.camera.zoom)}</strong>
        </span>
        <span className="fpb-status-divider" aria-hidden="true" />
        <span className="fpb-status-item">
          <span className="fpb-status-label">{t("Snap")}</span>
          <strong>{state.settings.snapEnabled ? 'ON' : 'OFF'}</strong>
        </span>
        <span className="fpb-status-divider" aria-hidden="true" />
        <span className="fpb-status-item">
          <span className="fpb-status-label">{t("Grid")}</span>
          <strong>{state.settings.gridEnabled ? 'ON' : 'OFF'}</strong>
        </span>
      </div>

      <div className="fpb-status-group">
        <span className="fpb-status-item">
          <span className="fpb-status-label">{t("Objects")}</span>
          <strong>{objectCount}</strong>
        </span>
        <span className="fpb-status-divider" aria-hidden="true" />
        <span className="fpb-status-item">
          <span className="fpb-status-label">{t("Unsaved Changes")}</span>
          <strong>{state.hasUnsavedChanges ? 'Yes' : 'No'}</strong>
        </span>
      </div>
    </footer>
  )
}
