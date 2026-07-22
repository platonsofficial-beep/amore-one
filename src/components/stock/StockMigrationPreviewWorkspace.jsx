/**
 * Read-only Inventory Migration Preview Workspace.
 * Presentation only — shows what Phase 1 would do before execution.
 * Uses existing migration metrics. No RPCs, writes, or execution controls.
 */

function asCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function formatCount(value, available) {
  if (!available) return 'Unknown'
  return `${asCount(value)}`
}

/**
 * Build preview summary cards from existing metrics only.
 */
export function buildPreviewSummaryCards({ metrics = null, metricsAvailable = false } = {}) {
  const remainingUnresolved = metricsAvailable
    ? asCount(metrics?.remainingClassifiedAutoLink)
      + asCount(metrics?.remainingClassifiedAutoCreate)
      + asCount(metrics?.manualReview)
    : null

  return [
    {
      id: 'legacy',
      label: 'Legacy rows',
      value: formatCount(metrics?.legacyItems ?? metrics?.total, metricsAvailable),
    },
    {
      id: 'auto-link',
      label: 'Auto-link',
      value: formatCount(metrics?.autoLink, metricsAvailable),
    },
    {
      id: 'auto-create',
      label: 'Auto-create',
      value: formatCount(metrics?.autoCreate, metricsAvailable),
    },
    {
      id: 'manual',
      label: 'Manual review',
      value: formatCount(metrics?.manualReview, metricsAvailable),
    },
    {
      id: 'remaining',
      label: 'Remaining unresolved',
      value: remainingUnresolved === null ? 'Unknown' : `${remainingUnresolved}`,
    },
  ]
}

/**
 * Build expected Phase 1 action groups from existing metrics only.
 */
export function buildPreviewExpectedActions({ metrics = null, metricsAvailable = false } = {}) {
  if (!metricsAvailable) {
    return [
      {
        id: 'unknown',
        title: 'Unknown',
        description: 'Expected Phase 1 actions cannot be determined without live metrics.',
        value: 'Unknown',
        tone: 'unknown',
      },
    ]
  }

  return [
    {
      id: 'will-link',
      title: 'Will Link',
      description: 'Classified auto-link rows still waiting to be linked in Phase 1.',
      value: `${asCount(metrics?.remainingClassifiedAutoLink)}`,
      tone: 'link',
    },
    {
      id: 'will-create',
      title: 'Will Create',
      description: 'Classified auto-create rows still waiting to be created in Phase 1.',
      value: `${asCount(metrics?.remainingClassifiedAutoCreate)}`,
      tone: 'create',
    },
    {
      id: 'needs-review',
      title: 'Needs Review',
      description: 'Manual review map rows that will not auto-execute.',
      value: `${asCount(metrics?.manualReview)}`,
      tone: 'review',
    },
    {
      id: 'skipped',
      title: 'Skipped',
      description: 'Map rows already marked skipped.',
      value: `${asCount(metrics?.skipped)}`,
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
