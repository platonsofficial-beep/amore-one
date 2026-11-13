import { formatZoomPercent } from '../hooks/useCanvasViewport'
import { t } from '../../i18n/i18n'

export function CanvasNavigationWidget({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitAll,
  onZoomTo100,
  onResetView,
}) {
  return (
    <div className="fpb-nav-widget" aria-label={t("Canvas navigation")}>
      <div className="fpb-nav-widget-zoom">
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-zoom"
          onClick={onZoomIn}
          title={t("Zoom in")}
          aria-label={t("Zoom in")}
        >
          +
        </button>
        <span className="fpb-nav-widget-zoom-label">{formatZoomPercent(zoom)}</span>
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-zoom"
          onClick={onZoomOut}
          title={t("Zoom out")}
          aria-label={t("Zoom out")}
        >
          −
        </button>
      </div>

      <div className="fpb-nav-widget-divider" aria-hidden="true" />

      <div className="fpb-nav-widget-actions">
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-action"
          onClick={onFitAll}
          title={t("Fit all objects")}
        >
          {t("Fit")}
        </button>
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-action"
          onClick={onZoomTo100}
          title={t("Zoom to 100%")}
        >
          100%
        </button>
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-action"
          onClick={onResetView}
          title={t("Reset view")}
        >
          {t("Reset View")}
        </button>
      </div>
    </div>
  )
}
