/**
 * Read-only Inventory Migration Preview Workspace.
 * Presentation only — shows what Phase 1 would do before execution.
 * Uses existing migration metrics. No RPCs, writes, or execution controls.
 */

function asCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : null
}

/**
 * Map existing migration metrics into Preview execution fields.
 * Does not invent estimates — only reads exposed metric keys.
 * Remaining unresolved is the sum of three existing remaining/manual fields.
 */
export function buildPreviewExecutionData({ metrics = null, metricsAvailable = false } = {}) {
  if (!metricsAvailable) {
    return {
      legacyRows: 'Unknown',
      autoLink: 'Unknown',
      autoCreate: 'Unknown',
      manualReview: 'Unknown',
      remainingUnresolved: 'Unknown',
      willLink: 'Unknown',
      willCreate: 'Unknown',
      needsReview: 'Unknown',
      skipped: 'Unknown',
    }
  }

  const willLink = asCount(metrics?.remainingClassifiedAutoLink)
  const willCreate = asCount(metrics?.remainingClassifiedAutoCreate)
  const needsReview = asCount(metrics?.manualReview)
  const skipped = asCount(metrics?.skipped)
  const legacyRows = asCount(metrics?.legacyItems ?? metrics?.total)
  const autoLink = asCount(metrics?.autoLink)
  const autoCreate = asCount(metrics?.autoCreate)

  const remainingParts = [willLink, willCreate, needsReview]
  const remainingUnresolved = remainingParts.every((part) => part !== null)
    ? remainingParts.reduce((sum, part) => sum + part, 0)
    : null

  return {
    legacyRows: legacyRows === null ? 'Unknown' : `${legacyRows}`,
    autoLink: autoLink === null ? 'Unknown' : `${autoLink}`,
    autoCreate: autoCreate === null ? 'Unknown' : `${autoCreate}`,
    manualReview: needsReview === null ? 'Unknown' : `${needsReview}`,
    remainingUnresolved: remainingUnresolved === null ? 'Unknown' : `${remainingUnresolved}`,
    willLink: willLink === null ? 'Unknown' : `${willLink}`,
    willCreate: willCreate === null ? 'Unknown' : `${willCreate}`,
    needsReview: needsReview === null ? 'Unknown' : `${needsReview}`,
    skipped: skipped === null ? 'Unknown' : `${skipped}`,
  }
}

/**
 * Build preview summary cards from existing metrics only.
 */
export function buildPreviewSummaryCards({ metrics = null, metricsAvailable = false } = {}) {
  const data = buildPreviewExecutionData({ metrics, metricsAvailable })
  return [
    { id: 'legacy', label: 'Legacy rows', value: data.legacyRows },
    { id: 'auto-link', label: 'Auto-link', value: data.autoLink },
    { id: 'auto-create', label: 'Auto-create', value: data.autoCreate },
    { id: 'manual', label: 'Manual review', value: data.manualReview },
    { id: 'remaining', label: 'Remaining unresolved', value: data.remainingUnresolved },
  ]
}

/**
 * Build expected Phase 1 action groups from existing metrics only.
 * Row structure is stable; values are real counts or Unknown.
 */
export function buildPreviewExpectedActions({ metrics = null, metricsAvailable = false } = {}) {
  const data = buildPreviewExecutionData({ metrics, metricsAvailable })

  return [
    {
      id: 'will-link',
      title: 'Will Link',
      description: 'Classified auto-link rows still waiting to be linked in Phase 1.',
      value: data.willLink,
      tone: 'link',
    },
    {
      id: 'will-create',
      title: 'Will Create',
      description: 'Classified auto-create rows still waiting to be created in Phase 1.',
      value: data.willCreate,
      tone: 'create',
    },
    {
      id: 'needs-review',
      title: 'Needs Review',
      description: 'Manual review map rows that will not auto-execute.',
      value: data.needsReview,
      tone: 'review',
    },
    {
      id: 'skipped',
      title: 'Skipped',
      description: 'Map rows already marked skipped.',
      value: data.skipped,
      tone: 'skipped',
    },
  ]
}

const PREVIEW_NOTES = [
  'Phase 1 applies classified auto-link and auto-create resolutions from the migration map.',
  'Manual review rows remain operator-gated and are not auto-executed here.',
  'This Preview is read-only and does not start Phase 1.',
]

/**
 * Read-only Preview Workspace — what will happen before Phase 1 executes.
 */
export function StockMigrationPreviewWorkspace({
  metrics = null,
  metricsAvailable = false,
  isLoading = false,
} = {}) {
  const summaryCards = buildPreviewSummaryCards({ metrics, metricsAvailable })
  const expectedActions = buildPreviewExpectedActions({ metrics, metricsAvailable })

  return (
    <section
      className="panel staff-panel stock-migration-panel stock-migration-preview-workspace"
      aria-label="Migration preview workspace"
      aria-busy={isLoading ? 'true' : undefined}
    >
      <header className="stock-migration-preview-header">
        <div className="stock-migration-preview-header-copy">
          <p className="stock-migration-preview-eyebrow">Preview</p>
          <h3 className="stock-migration-panel-title">Preview Workspace</h3>
          <p className="stock-migration-panel-copy">
            Read-only view of what Phase 1 would do before any migration execution.
          </p>
        </div>
        <span className="stock-migration-preview-mode-badge" aria-label="Read-only preview">
          Read-only
        </span>
      </header>

      <section className="stock-migration-preview-section" aria-label="Migration summary">
        <div className="stock-migration-preview-section-header">
          <h4 className="stock-migration-preview-section-title">Migration summary</h4>
          <p className="stock-migration-preview-section-copy">
            Live counts from the current workspace migration map.
          </p>
        </div>
        <div className="stock-migration-preview-summary-grid">
          {summaryCards.map((card) => (
            <article key={card.id} className="stock-migration-preview-summary-card">
              <p className="stock-migration-preview-summary-label">{card.label}</p>
              <p className="stock-migration-preview-summary-value">{card.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="stock-migration-preview-section" aria-label="Expected actions">
        <div className="stock-migration-preview-section-header">
          <h4 className="stock-migration-preview-section-title">Expected actions</h4>
          <p className="stock-migration-preview-section-copy">
            Grouped outcomes Phase 1 would encounter from current map state.
          </p>
        </div>
        <ul className="stock-migration-preview-actions">
          {expectedActions.map((action) => (
            <li
              key={action.id}
              className={`stock-migration-preview-action is-${action.tone}`}
            >
              <div className="stock-migration-preview-action-copy">
                <p className="stock-migration-preview-action-title">{action.title}</p>
                <p className="stock-migration-preview-action-description">{action.description}</p>
              </div>
              <span className="stock-migration-preview-action-value">{action.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stock-migration-preview-section" aria-label="Preview notes">
        <div className="stock-migration-preview-section-header">
          <h4 className="stock-migration-preview-section-title">Preview notes</h4>
          <p className="stock-migration-preview-section-copy">
            What Phase 1 is expected to do when execution is later enabled.
          </p>
        </div>
        <ul className="stock-migration-preview-notes">
          {PREVIEW_NOTES.map((note) => (
            <li key={note} className="stock-migration-preview-note">
              {note}
            </li>
          ))}
        </ul>
      </section>

      <aside
        className="stock-migration-preview-reminder"
        role="status"
        aria-label="Execution reminder"
      >
        <p className="stock-migration-preview-reminder-label">Execution reminder</p>
        <p className="stock-migration-preview-reminder-copy">No data has been changed.</p>
      </aside>
    </section>
  )
}
