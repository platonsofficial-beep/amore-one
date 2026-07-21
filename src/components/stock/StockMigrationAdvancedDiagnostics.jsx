/**
 * Presentation-only collapsible shell for migration diagnostics.
 * Children always remain mounted — collapse is CSS/inert only.
 */
export function StockMigrationAdvancedDiagnostics({
  open = false,
  onOpenChange = null,
  children = null,
}) {
  const expanded = Boolean(open)

  return (
    <section
      className={[
        'panel',
        'staff-panel',
        'stock-migration-panel',
        'stock-migration-diagnostics',
        expanded ? 'is-open' : 'is-collapsed',
      ].join(' ')}
      aria-label="Advanced diagnostics"
      data-diagnostics-open={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        className="stock-migration-diagnostics-toggle"
        aria-expanded={expanded}
        aria-controls="stock-migration-diagnostics-panel"
        onClick={() => onOpenChange?.(!expanded)}
      >
        <span className="stock-migration-diagnostics-toggle-copy">
          <span className="stock-migration-diagnostics-title">Advanced Diagnostics</span>
          <span className="stock-migration-diagnostics-subtitle">
            Technical migration panels and operator tools.
          </span>
        </span>
        <span className="stock-migration-diagnostics-chevron" aria-hidden="true">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      <div
        id="stock-migration-diagnostics-panel"
        className="stock-migration-diagnostics-panel"
        role="region"
        aria-label="Advanced diagnostics panels"
        aria-hidden={expanded ? undefined : true}
        inert={expanded ? undefined : true}
      >
        <div className="stock-migration-diagnostics-panel-inner">
          {children}
        </div>
      </div>
    </section>
  )
}
