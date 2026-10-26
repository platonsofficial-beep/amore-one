export function InventoryImportUndoConfirm({
  titleId = 'inventory-import-undo-title',
  onCancel,
  onConfirm,
  isUndoing = false,
}) {
  return (
    <div
      className="inventory-import-undo-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <h4 id={titleId}>Undo this import?</h4>
      <p>Products created by this import will be removed. This cannot be undone.</p>
      <div className="inventory-import-undo-dialog-actions">
        <button
          type="button"
          className="ghost-btn inventory-import-undo-btn"
          onClick={onCancel}
          disabled={isUndoing}
        >
          Cancel
        </button>
        <button
          type="button"
          className="primary-btn inventory-import-undo-btn"
          data-undo-import="confirm"
          onClick={onConfirm}
          disabled={isUndoing}
        >
          {isUndoing ? 'Undoing…' : 'Undo import'}
        </button>
      </div>
    </div>
  )
}
