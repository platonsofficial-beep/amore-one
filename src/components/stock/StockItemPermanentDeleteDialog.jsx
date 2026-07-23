/**
 * P8.16.25 — Permanent delete dialog for one Stock product (manager-only).
 * Preview (P8.16.23) + password re-auth + delete RPC (P8.16.24).
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { signInWithPassword } from '../../services/authService'
import { previewStockItemPermanentDelete } from '../../services/stockItemPermanentDeletePreviewService'
import { deleteStockItemPermanently } from '../../services/stockItemPermanentDeleteService'
import {
  buildOpenInventoryCountBlockDetails,
  buildStockItemPermanentDeletePhrase,
  friendlyStockItemPermanentDeleteError,
  matchesStockItemPermanentDeletePhrase,
} from '../../lib/stockItemPermanentDeleteUi'
import { getOpenInventoryCountBlockerForStockItem } from '../../services/inventoryCountService'

function readInputValue(ref) {
  return `${ref.current?.value ?? ''}`.trim()
}

function readConfirmInputValue(ref) {
  // Do not trim — trailing spaces must remain while typing (iPad SPACE regression).
  return `${ref.current?.value ?? ''}`
}

function countOrZero(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function StockItemPermanentDeleteDialog({
  workspaceId,
  item,
  onClose,
  onCompleted,
  onOpenBlockingInventoryCount,
  returnFocusEl = null,
}) {
  const { user, session } = useAuth()
  const [phase, setPhase] = useState('loading') // loading | ready | preview_error | executing | success
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [openCountBlocker, setOpenCountBlocker] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [canDismiss, setCanDismiss] = useState(false)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)
  const inFlightRef = useRef(false)

  const productName = `${preview?.product?.name ?? item?.name ?? ''}`.trim()
  const confirmPhrase = buildStockItemPermanentDeletePhrase(productName)
  const openCountBlockDetails = buildOpenInventoryCountBlockDetails({
    productName,
    blocker: openCountBlocker,
  })
  const hasOpenCountBlock = countOrZero(preview?.inventory_count?.open_references) > 0
    || Boolean(openCountBlocker)

  const syncPasswordFromDom = () => {
    const domValue = readInputValue(passwordRef)
    if (domValue && domValue !== password) {
      setPassword(domValue)
    }
    return domValue || `${password}`.trim()
  }

  const confirmExact = matchesStockItemPermanentDeletePhrase(confirmText, productName)
    || matchesStockItemPermanentDeletePhrase(readConfirmInputValue(confirmRef), productName)
  const effectivePassword = `${password}`.trim() || readInputValue(passwordRef)
  const canSubmit = phase === 'ready'
    && Boolean(preview?.product?.id)
    && confirmExact
    && effectivePassword.length > 0
    && !isBusy
    && !inFlightRef.current

  useEffect(() => {
    const timer = window.setTimeout(() => setCanDismiss(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const stockItemId = `${item?.id ?? ''}`.trim()

    const loadPreview = async () => {
      setPhase('loading')
      setError('')
      setPreview(null)
      setOpenCountBlocker(null)
      try {
        const next = await previewStockItemPermanentDelete(workspaceId, stockItemId)
        if (cancelled) return
        setPreview(next)
        setPhase('ready')

        if (countOrZero(next?.inventory_count?.open_references) > 0) {
          try {
            const blocker = await getOpenInventoryCountBlockerForStockItem({
              workspaceId,
              stockItemId,
            })
            if (!cancelled) setOpenCountBlocker(blocker)
          } catch (blockerError) {
            console.warn('[StockItemPermanentDeleteDialog] Open count blocker lookup failed:', blockerError)
            if (!cancelled) setOpenCountBlocker(null)
          }
        }
      } catch (loadError) {
        if (cancelled) return
        setError(friendlyStockItemPermanentDeleteError(loadError))
        setPhase('preview_error')
        setPreview(null)
        setOpenCountBlocker(null)
      }
    }

    if (!stockItemId || !workspaceId) {
      setError('This product could not be found in the current workspace.')
      setPhase('preview_error')
      return undefined
    }

    loadPreview()
    return () => {
      cancelled = true
    }
  }, [workspaceId, item?.id])

  // Password managers often fill the DOM without firing React onChange.
  // Poll password only — never rewrite the confirm phrase from a trimmed DOM read
  // (that erased trailing spaces on iPad while typing).
  useEffect(() => {
    if (phase !== 'ready' || isBusy) return undefined

    const timer = window.setInterval(() => {
      const domPassword = readInputValue(passwordRef)
      if (domPassword && domPassword !== password) {
        setPassword(domPassword)
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [phase, isBusy, password])

  useEffect(() => {
    if (phase !== 'ready') return undefined
    const frame = window.requestAnimationFrame(() => {
      confirmRef.current?.focus?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [phase])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (isBusy || phase === 'executing' || inFlightRef.current || !canDismiss) return
      onClose?.()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [canDismiss, isBusy, onClose, phase])

  useEffect(() => () => {
    if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
      window.setTimeout(() => {
        try {
          returnFocusEl.focus()
        } catch {
          // Trigger may have unmounted with the menu.
        }
      }, 0)
    }
  }, [returnFocusEl])

  const handleDismiss = () => {
    if (isBusy || phase === 'executing' || inFlightRef.current || !canDismiss) return
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()

    if (inFlightRef.current || isBusy || phase === 'executing') {
      return
    }

    const liveConfirm = readConfirmInputValue(confirmRef) || confirmText
    const livePassword = syncPasswordFromDom()

    if (phase !== 'ready' || !preview?.product?.id) {
      setError('Permanent delete preview is not ready yet.')
      return
    }

    if (!matchesStockItemPermanentDeletePhrase(liveConfirm, productName)) {
      setError(`Type ${confirmPhrase} to continue.`)
      return
    }

    if (!livePassword) {
      setError('Enter your account password to continue.')
      return
    }

    const email = `${user?.email ?? session?.user?.email ?? ''}`.trim()
    if (!email) {
      setError('Unable to verify your account right now.')
      return
    }

    inFlightRef.current = true
    setIsBusy(true)
    setError('')
    setPhase('executing')

    try {
      await signInWithPassword(email, livePassword)
    } catch {
      setError('Incorrect password. Please try again.')
      setIsBusy(false)
      setPhase('ready')
      inFlightRef.current = false
      return
    }

    try {
      const deleteResult = await deleteStockItemPermanently(workspaceId, preview.product.id)
      setResult(deleteResult)
      setPhase('success')
      setIsBusy(false)
      inFlightRef.current = false

      try {
        await onCompleted?.(deleteResult)
      } catch (refreshError) {
        console.warn('[StockItemPermanentDeleteDialog] Refresh after delete failed:', refreshError)
      }
    } catch (deleteError) {
      const friendly = friendlyStockItemPermanentDeleteError(deleteError)
      if (`${deleteError?.code ?? ''}`.toUpperCase() === 'BLOCKED_OPEN_COUNT' && !openCountBlocker) {
        try {
          const blocker = await getOpenInventoryCountBlockerForStockItem({
            workspaceId,
            stockItemId: preview.product.id,
          })
          setOpenCountBlocker(blocker)
        } catch (blockerError) {
          console.warn('[StockItemPermanentDeleteDialog] Open count blocker lookup failed:', blockerError)
        }
      }
      setError(friendly)
      setPhase('ready')
      setIsBusy(false)
      inFlightRef.current = false
    }
  }

  if (!item || typeof document === 'undefined') return null

  const movements = preview?.movements ?? {}
  const inventoryCount = preview?.inventory_count ?? {}
  const importRefs = preview?.import ?? {}
  const migration = preview?.migration ?? {}
  const orders = preview?.orders ?? {}
  const supplier = preview?.supplier ?? {}
  const deletedMovements = countOrZero(result?.deleted?.movements?.total)

  return createPortal(
    <div
      className="employee-modal-backdrop task-modal-backdrop stock-item-permanent-delete-backdrop"
      onClick={handleDismiss}
    >
      <div
        className="employee-modal stock-item-permanent-delete-dialog task-form-modal is-responsive-sheet has-viewport-max-height"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-item-permanent-delete-title"
        aria-busy={isBusy || phase === 'loading' || phase === 'executing'}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Destructive action</p>
            <h3 id="stock-item-permanent-delete-title">
              {phase === 'success' ? 'Product deleted' : '⚠ Permanently Delete Product'}
            </h3>
            {phase !== 'success' ? (
              <p className="stock-item-permanent-delete-subtitle">
                This action permanently removes this Stock product.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={handleDismiss}
            disabled={isBusy || phase === 'executing'}
            aria-label="Close permanent delete"
          >
            ✕
          </button>
        </div>

        {phase === 'success' && result ? (
          <>
            <div className="stock-item-permanent-delete-body is-internal-scroll">
              <div className="stock-item-permanent-delete-success" role="status">
                <p className="stock-item-permanent-delete-copy">
                  <strong>Successfully deleted:</strong>
                </p>
                <ul className="stock-item-permanent-delete-list">
                  <li>✓ Product</li>
                  <li>
                    ✓
                    {' '}
                    {deletedMovements}
                    {' '}
                    Stock movement
                    {deletedMovements === 1 ? '' : 's'}
                  </li>
                </ul>
                <p className="stock-item-permanent-delete-copy">
                  <strong>Preserved:</strong>
                </p>
                <ul className="stock-item-permanent-delete-list">
                  <li>✓ Purchase Orders</li>
                  <li>✓ Inventory Count snapshots</li>
                  <li>✓ Import history</li>
                  <li>✓ Migration history</li>
                </ul>
              </div>
            </div>
            <div className="modal-actions stock-item-permanent-delete-actions is-dialog-footer">
              <button type="button" className="primary-btn" onClick={handleDismiss}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form className="stock-item-permanent-delete-form" onSubmit={handleSubmit}>
            <div className="stock-item-permanent-delete-body is-internal-scroll">
              {phase === 'loading' ? (
                <p className="stock-item-permanent-delete-copy" role="status">
                  Loading permanent delete preview…
                </p>
              ) : null}

              {phase === 'preview_error' ? (
                <p className="staff-status-banner stock-item-permanent-delete-error" role="alert">
                  {error || 'Permanent delete preview is unavailable.'}
                </p>
              ) : null}

              {(phase === 'ready' || phase === 'executing') && preview?.product ? (
                <>
                  <div className="stock-item-permanent-delete-product-card" aria-label="Product summary">
                    <strong>{preview.product.name}</strong>
                    <p>
                      {preview.product.unit || '—'}
                      {' · '}
                      Qty
                      {' '}
                      {preview.product.current_quantity}
                      {' · '}
                      {preview.product.active ? 'Active' : 'Inactive'}
                    </p>
                  </div>

                  <section className="stock-item-permanent-delete-section" aria-label="Deleted records">
                    <h4>This product will be deleted</h4>
                    <ul className="stock-item-permanent-delete-list">
                      <li>✓ Product</li>
                      <li>✓ Current quantity</li>
                      <li>✓ Stock movements</li>
                    </ul>
                    <dl className="stock-item-permanent-delete-stats">
                      <div><dt>Receive</dt><dd>{countOrZero(movements.receive)}</dd></div>
                      <div><dt>Usage</dt><dd>{countOrZero(movements.usage)}</dd></div>
                      <div><dt>Adjustments</dt><dd>{countOrZero(movements.adjustment)}</dd></div>
                      <div><dt>Stock Count</dt><dd>{countOrZero(movements.stock_count)}</dd></div>
                      <div><dt>Total</dt><dd>{countOrZero(movements.total)}</dd></div>
                    </dl>
                  </section>

                  <section className="stock-item-permanent-delete-section" aria-label="Preserved records">
                    <h4>The following will be preserved</h4>
                    <ul className="stock-item-permanent-delete-list">
                      <li>
                        ✓ Purchase Orders (
                        {countOrZero(orders.received) + countOrZero(orders.cancelled)}
                        {' '}
                        historical lines)
                      </li>
                      <li>
                        ✓ Inventory Count snapshots (
                        {countOrZero(inventoryCount.posted_references)}
                        {' '}
                        posted)
                      </li>
                      <li>
                        ✓ Import history (
                        {countOrZero(importRefs.matched_refs) + countOrZero(importRefs.applied_refs)}
                        )
                      </li>
                      <li>
                        ✓ Migration history (
                        {countOrZero(migration.map_refs)}
                        )
                      </li>
                      <li>
                        ✓ Supplier relationship (
                        {supplier.supplier_name || supplier.supplier_id || 'none'}
                        )
                      </li>
                    </ul>
                    <p className="stock-item-permanent-delete-copy">
                      Historical documents remain readable.
                    </p>
                  </section>

                  {hasOpenCountBlock ? (
                    <section
                      className="stock-item-permanent-delete-block-card"
                      aria-label="Blocked by Inventory Count"
                    >
                      <h4>{openCountBlockDetails.title}</h4>
                      {openCountBlockDetails.fields ? (
                        <dl className="stock-item-permanent-delete-block-meta">
                          {openCountBlockDetails.fields.map((field) => (
                            <div key={field.label}>
                              <dt>{field.label}</dt>
                              <dd>{field.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="stock-item-permanent-delete-copy">
                          {openCountBlockDetails.fallbackMessage}
                        </p>
                      )}
                      <p className="stock-item-permanent-delete-copy">
                        {openCountBlockDetails.guidance}
                      </p>
                      {typeof onOpenBlockingInventoryCount === 'function' ? (
                        <button
                          type="button"
                          className="ghost-btn stock-item-permanent-delete-open-count-btn"
                          onClick={() => {
                            const sessionId = `${openCountBlocker?.sessionId ?? ''}`.trim()
                            onOpenBlockingInventoryCount(sessionId)
                            onClose?.()
                          }}
                          disabled={isBusy}
                        >
                          Open Inventory Count
                        </button>
                      ) : null}
                    </section>
                  ) : null}

                  <label className="form-field stock-item-permanent-delete-confirm-field">
                    <span>
                      Type
                      {' '}
                      <strong>{confirmPhrase}</strong>
                      {' '}
                      to confirm
                    </span>
                    <input
                      ref={confirmRef}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={confirmText}
                      onChange={(event) => {
                        setConfirmText(event.target.value)
                      }}
                      disabled={isBusy}
                      aria-label="Typed confirmation phrase"
                    />
                  </label>

                  <label className="form-field stock-item-permanent-delete-password-field">
                    <span>Confirm with your account password</span>
                    <input
                      ref={passwordRef}
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      defaultValue=""
                      onChange={(event) => setPassword(event.target.value)}
                      onInput={(event) => setPassword(event.target.value)}
                      onBlur={() => {
                        syncPasswordFromDom()
                      }}
                      disabled={isBusy}
                      aria-label="Account password"
                    />
                  </label>
                </>
              ) : null}

              {error && phase !== 'preview_error' ? (
                <p className="staff-status-banner stock-item-permanent-delete-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="modal-actions stock-item-permanent-delete-actions is-dialog-footer">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleDismiss}
                disabled={isBusy || phase === 'executing'}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-btn stock-item-permanent-delete-submit"
                disabled={!canSubmit || phase === 'loading' || phase === 'preview_error'}
              >
                {phase === 'executing' || isBusy ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
