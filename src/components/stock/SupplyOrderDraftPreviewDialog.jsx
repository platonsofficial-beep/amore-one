import { useEffect, useState } from 'react'
import { updateSupplyOrderDraftReviewQuantity } from '../../lib/stockSupplyOrderDraft'

export function SupplyOrderDraftPreviewDialog({
  lines = [],
  review = [],
  isSaving = false,
  onCancel,
  onConfirm,
}) {
  const [groups, setGroups] = useState(review)

  useEffect(() => {
    setGroups(Array.isArray(review) ? review : [])
  }, [review])

  useEffect(() => {
    if (!lines.length && !groups.length) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || isSaving) return
      event.preventDefault()
      onCancel?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [groups.length, isSaving, lines.length, onCancel])

  const usingReview = Array.isArray(review)
  if (!lines.length && !groups.length) return null

  const handleQuantity = (groupIndex, itemIndex, value) => {
    setGroups((current) => updateSupplyOrderDraftReviewQuantity(current, groupIndex, itemIndex, value))
  }

  return (
    <div className="supply-draft-preview" role="presentation">
      <section
        className="supply-draft-preview-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supply-draft-preview-title"
      >
        <h2 id="supply-draft-preview-title">Prepare drafts</h2>
        <p>Check each supplier, product, and quantity. Nothing is saved until you confirm.</p>
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
        <div className="supply-draft-preview-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onConfirm?.(usingReview ? groups : undefined)}
            disabled={isSaving || (usingReview ? groups.length === 0 : lines.length === 0)}
          >
            {isSaving ? 'Preparing…' : 'Confirm drafts'}
          </button>
        </div>
      </section>
    </div>
  )
}
