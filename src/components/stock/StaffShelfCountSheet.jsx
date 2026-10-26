import { useEffect, useMemo, useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { formatStockQuantity } from '../../lib/stockUtils'
import { buildProductDisplayNameFromItem } from '../../lib/stockProductIdentity'
import {
  STAFF_SHELF_COUNT_EMPTY_MESSAGE,
  STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE,
  buildStaffShelfCountLines,
  formatStaffShelfCountInput,
  formatStaffShelfOnHand,
  isStaffShelfCountable,
  toStaffShelfCountRows,
} from '../../lib/staffShelfCount'
import {
  staffShelfCountAvailable,
  submitStaffShelfCount,
} from '../../services/staffShelfCountService'

function initialDrafts(rows) {
  const drafts = {}
  for (const row of rows) {
    if (!isStaffShelfCountable(row)) continue
    drafts[row.stockItemId] = formatStaffShelfCountInput(row.quantity)
  }
  return drafts
}

/**
 * Phone count for one shelf. Staff submit quantities. A manager posts the
 * existing Inventory Count session before any balance changes. No costs.
 *
 * @param {{
 *   workspaceId?: string,
 *   storage?: { id?: string, name?: string },
 *   products?: object[],
 *   parsAvailable?: boolean,
 *   onClose?: () => void,
 *   countAvailable?: typeof staffShelfCountAvailable,
 *   submitCount?: typeof submitStaffShelfCount,
 * }} props
 */
export function StaffShelfCountSheet({
  workspaceId = '',
  storage = null,
  products = [],
  parsAvailable = false,
  onClose,
  countAvailable = staffShelfCountAvailable,
  submitCount = submitStaffShelfCount,
}) {
  const rows = useMemo(
    () => toStaffShelfCountRows(products.map((row) => ({
      ...row,
      displayName: buildProductDisplayNameFromItem(row) || row?.name,
    }))),
    [products],
  )
  const countable = rows.filter(isStaffShelfCountable)
  const skipped = rows.filter((row) => !isStaffShelfCountable(row))
  const [drafts, setDrafts] = useState(() => initialDrafts(rows))
  const [available, setAvailable] = useState(true)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const storageName = `${storage?.name ?? ''}`.trim() || 'Shelf'
  const storageId = `${storage?.id ?? ''}`.trim()

  useEscapeToClose(() => {
    if (!isSubmitting) onClose?.()
  }, { enabled: true })

  useEffect(() => {
    let cancelled = false
    countAvailable()
      .then((ready) => {
        if (cancelled) return
        setAvailable(Boolean(ready))
        setChecked(true)
      })
      .catch(() => {
        if (cancelled) return
        setAvailable(false)
        setChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [countAvailable])

  const handleSubmit = async () => {
    if (isSubmitting || success) return
    if (!available) {
      setError(STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE)
      return
    }
    const built = buildStaffShelfCountLines(rows, drafts)
    if (!built.ok) {
      setError(built.error)
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      await submitCount({
        workspaceId,
        workspaceStorageId: storageId,
        lines: built.lines,
      })
      setSuccess('Sent to a manager. Stock on this shelf stays as it is until they post the count.')
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit this shelf count right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="employee-modal-backdrop staff-shelf-count-backdrop"
      role="presentation"
      data-testid="staff-shelf-count-sheet"
      onClick={() => {
        if (!isSubmitting) onClose?.()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-shelf-count-title"
        className="employee-modal staff-shelf-count-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <h2 id="staff-shelf-count-title">Count shelf</h2>
            <p className="stock-modal-subtitle">{storageName}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close shelf count"
            disabled={isSubmitting}
            onClick={() => onClose?.()}
          >
            ×
          </button>
        </header>

        <p className="staff-shelf-count-note" role="note">
          Enter what is on the shelf. A manager posts the count before stock changes.
        </p>

        {checked && !available ? (
          <p className="staff-shelf-count-status" role="status" data-testid="staff-shelf-count-unavailable">
            {STAFF_SHELF_COUNT_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}

        {countable.length === 0 ? (
          <p className="staff-shelf-count-status" role="status">
            {STAFF_SHELF_COUNT_EMPTY_MESSAGE}
          </p>
        ) : (
          <ul className="staff-shelf-count-list">
            {countable.map((row) => (
              <li key={row.stockItemId} className="staff-shelf-count-row">
                <div className="staff-shelf-count-identity">
                  <strong>{row.displayName}</strong>
                  <span>On shelf {formatStaffShelfOnHand(row)}</span>
                  {parsAvailable && row.parQuantity != null ? (
                    <span>Par {formatStockQuantity(row.parQuantity, row.unit)}</span>
                  ) : null}
                </div>
                <label className="staff-shelf-count-field">
                  <span>Counted</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="staff-shelf-count-qty"
                    aria-label={`Counted quantity for ${row.displayName}`}
                    value={drafts[row.stockItemId] ?? ''}
                    disabled={isSubmitting || Boolean(success) || (checked && !available)}
                    onChange={(event) => {
                      const next = event.target.value
                      setDrafts((current) => ({ ...current, [row.stockItemId]: next }))
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}

        {skipped.length > 0 ? (
          <p className="staff-shelf-count-skipped" data-testid="staff-shelf-count-skipped">
            {skipped.map((row) => row.displayName).join(', ')}
            {' '}
            {skipped.length === 1 ? 'is' : 'are'}
            {' '}
            not in this count. A balance has to exist on the shelf first.
          </p>
        ) : null}

        {error ? (
          <p className="staff-shelf-count-status is-error" role="alert">{error}</p>
        ) : null}
        {success ? (
          <p className="staff-shelf-count-status is-success" role="status">{success}</p>
        ) : null}

        <div className="staff-shelf-count-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={isSubmitting}
            onClick={() => onClose?.()}
          >
            {success ? 'Done' : 'Cancel'}
          </button>
          {countable.length > 0 && !success ? (
            <button
              type="button"
              className="primary-btn"
              data-testid="staff-shelf-count-submit"
              disabled={isSubmitting || (checked && !available)}
              onClick={() => { void handleSubmit() }}
            >
              {isSubmitting ? 'Sending…' : 'Submit for approval'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
