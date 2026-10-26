export function SupplyOrderDraftPreviewDialog({
  lines = [],
  isSaving = false,
  onCancel,
  onConfirm,
}) {
  if (!lines.length) return null

  return (
    <div className="supply-draft-preview" role="presentation">
      <section
        className="supply-draft-preview-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supply-draft-preview-title"
      >
        <h2 id="supply-draft-preview-title">Prepare drafts</h2>
        <p>These drafts will be created or updated. Nothing is saved until you confirm.</p>
        <ul>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="supply-draft-preview-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? 'Preparing…' : 'Confirm drafts'}
          </button>
        </div>
      </section>
    </div>
  )
}
