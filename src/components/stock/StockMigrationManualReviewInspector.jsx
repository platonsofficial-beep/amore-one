function Field({ label, value }) {
  const display = value === null || value === undefined || `${value}`.trim() === ''
    ? '—'
    : `${value}`

  return (
    <div className="stock-migration-review-field">
      <dt>{label}</dt>
      <dd>{display}</dd>
    </div>
  )
}

/**
 * Read-only detail inspector for a selected manual-review row.
 * No mutation controls.
 */
export function StockMigrationManualReviewInspector({ row = null }) {
  if (!row) {
    return (
      <div className="stock-migration-review-inspector stock-migration-review-inspector--empty">
        <div className="stock-empty-state stock-migration-review-empty">
          <h4>Select a row</h4>
          <p>Choose a manual review item from the list to inspect its details.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stock-migration-review-inspector" aria-label="Manual review detail">
      <div className="stock-migration-review-inspector-header">
        <p className="stock-migration-review-inspector-eyebrow">Manual review</p>
        <h3 className="stock-migration-review-inspector-title">{row.legacyName ?? '—'}</h3>
        <p className="stock-migration-review-inspector-subtitle">
          Read-only inspection. Resolution actions are not available in this view.
        </p>
      </div>

      <section className="stock-migration-review-section" aria-label="Legacy inventory item">
        <h4 className="stock-migration-review-section-title">Legacy inventory</h4>
        <dl className="stock-migration-review-fields">
          <Field label="Legacy item" value={row.legacyName} />
          <Field label="Legacy item ID" value={row.legacyItemId} />
          <Field label="Map ID" value={row.id} />
          <Field label="Category" value={row.category} />
          <Field label="Supplier" value={row.supplier} />
          <Field label="Unit" value={row.unit} />
        </dl>
      </section>

      <section className="stock-migration-review-section" aria-label="Classification">
        <h4 className="stock-migration-review-section-title">Classification</h4>
        <dl className="stock-migration-review-fields">
          <Field label="Current status" value={row.status} />
          <Field label="Current classification" value={row.classification} />
          <Field label="Current resolution" value={row.currentResolution} />
          <Field label="Conflict reason" value={row.conflictReason} />
          <Field label="Confidence" value={row.confidence} />
          <Field label="Notes" value={row.notes} />
        </dl>
      </section>

      <section className="stock-migration-review-section" aria-label="Candidate stock item">
        <h4 className="stock-migration-review-section-title">Matching / candidate</h4>
        <dl className="stock-migration-review-fields">
          <Field label="Candidate stock item" value={row.candidateStockName} />
          <Field label="Candidate / stock item ID" value={row.stockItemId ?? row.candidateStockId} />
          <Field label="Expected match info" value={row.expectedMatch} />
        </dl>
      </section>

      <section className="stock-migration-review-section" aria-label="Timestamps">
        <h4 className="stock-migration-review-section-title">Timestamps</h4>
        <dl className="stock-migration-review-fields">
          <Field label="Created" value={row.createdAt} />
          <Field label="Updated" value={row.updatedAt} />
        </dl>
      </section>
    </div>
  )
}
