export function PanelHeader({
  eyebrow,
  title,
  onClose,
  showClose = false,
  closeLabel = 'Close panel',
  children,
  className = '',
}) {
  return (
    <div className={`fpb-panel-header${className ? ` ${className}` : ''}`}>
      <div className="fpb-panel-header-row">
        <div className="fpb-panel-header-copy">
          {eyebrow ? <p className="fpb-panel-eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="fpb-panel-title">{title}</h2> : null}
        </div>
        {showClose && onClose ? (
          <button
            type="button"
            className="fpb-panel-close-btn"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ×
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}
