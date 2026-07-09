import { formatCameraZoomPercent } from '../lib/camera'

export function EditorZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onViewFit,
  className = '',
}) {
  return (
    <div className={`fpb-editor-zoom-controls${className ? ` ${className}` : ''}`} aria-label="Canvas zoom">
      <button
        type="button"
        className="fpb-editor-zoom-btn"
        onClick={onZoomOut}
        aria-label="Zoom out"
      >
        −
      </button>
      <span className="fpb-editor-zoom-label" aria-live="polite">
        {formatCameraZoomPercent(zoom)}
      </span>
      <button
        type="button"
        className="fpb-editor-zoom-btn"
        onClick={onZoomIn}
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="fpb-toolbar-btn fpb-editor-zoom-fit-btn"
        onClick={onViewFit}
      >
        View fit
      </button>
    </div>
  )
}
