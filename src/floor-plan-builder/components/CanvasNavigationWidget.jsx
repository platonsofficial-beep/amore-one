import { formatZoomPercent } from '../hooks/useCanvasViewport'

export function CanvasNavigationWidget({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitAll,
  onZoomTo100,
  onResetView,
}) {
  return (
    <div className="fpb-nav-widget" aria-label="Canvas navigation">
      <div className="fpb-nav-widget-zoom">
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-zoom"
          onClick={onZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="fpb-nav-widget-zoom-label">{formatZoomPercent(zoom)}</span>
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-zoom"
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
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
          title="Fit all objects"
        >
          Fit
        </button>
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-action"
          onClick={onZoomTo100}
          title="Zoom to 100%"
        >
          100%
        </button>
        <button
          type="button"
          className="fpb-nav-widget-btn fpb-nav-widget-btn-action"
          onClick={onResetView}
          title="Reset view"
        >
          Reset View
        </button>
      </div>
    </div>
  )
}
