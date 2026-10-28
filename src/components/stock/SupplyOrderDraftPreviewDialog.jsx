import { useEffect, useState } from 'react'
import { updateSupplyOrderDraftReviewQuantity } from '../../lib/stockSupplyOrderDraft'

export function SupplyOrderDraftPreviewDialog({
  isOpen = false,
  isLoading = false,
  lines = [],
  review = [],
  summary = '',
  message = '',
  isSaving = false,
  onCancel,
  onConfirm,
}) {
  const [groups, setGroups] = useState(review)

  useEffect(() => {
    setGroups(Array.isArray(review) ? review : [])
  }, [review])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || isSaving) return
      event.preventDefault()
      onCancel?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSaving, onCancel])

  const usingReview = Array.isArray(review)
  if (!isOpen) return null

  const handleQuantity = (groupIndex, itemIndex, value) => {
    setGroups((current) => updateSupplyOrderDraftReviewQuantity(current, groupIndex, itemIndex, value))
  }

  return (
    <div className="supply-draft-preview" role="presentation" onClick={() => { if (!isSaving) onCancel?.() }}>
      <section
        className="supply-draft-preview-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supply-draft-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="supply-draft-preview-header">
          <div>
            <p className="supply-draft-preview-kicker">Purchase orders</p>
            <h2 id="supply-draft-preview-title">Suggest order</h2>
          </div>
          <button
            type="button"
            className="icon-btn supply-draft-preview-close"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="supply-draft-preview-scroll">
        {isLoading ? (
          <p className="supply-draft-preview-summary" role="status">Preparing the suggested order…</p>
        ) : null}
        {`${summary ?? ''}`.trim() ? (
          <p className="supply-draft-preview-summary">{`${summary}`.trim()}</p>
        ) : null}
        {message && !isLoading ? <p role="status">{message}</p> : null}
        {!isLoading ? <p>Check each supplier, product, and quantity. Nothing is saved until you confirm.</p> : null}
        {groups.length > 0 ? (
          <div className="supply-draft-review">
            {groups.map((group, groupIndex) => (
              <section key={`${group.supplier}-${groupIndex}`} className="supply-draft-review-supplier" aria-label={group.supplier}>
                <h3>{group.supplier}</h3>
                <ul>
                  {group.items.map((item, itemIndex) => (
                    <li key={`${item.stockItemId ?? item.itemName}-${itemIndex}`}>
                      <span className="supply-draft-review-name">{item.itemName || 'Product'}</span>
                      <label className="supply-draft-review-qty">
                        <span className="sr-only">Quantity for {item.itemName || 'product'}</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={item.quantity}
                          disabled={isSaving}
                          onChange={(event) => handleQuantity(groupIndex, itemIndex, event.target.value)}
                        />
                        <span>{item.unit || 'units'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        </div>
        <div className="supply-draft-preview-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onConfirm?.(usingReview ? groups : undefined)}
            disabled={isSaving || isLoading || (usingReview ? groups.length === 0 : lines.length === 0)}
          >
            {isSaving ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </section>
    </div>
  )
}
