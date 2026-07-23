/**
 * P8.16.21 / P8.16.21a — Purchase Order document cleanup dialog (manager-only).
 * Document-only delete via P8.16.20 RPC. Never mutates quantities or movements.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { signInWithPassword } from '../../services/authService'
import {
  StockOrderCleanupError,
  cleanupPurchaseOrderDocuments,
  previewPurchaseOrderCleanup,
} from '../../services/stockOrderCleanupService'

export const PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE = 'DELETE PURCHASE ORDERS'

function friendlyCleanupError(error) {
  if (error instanceof StockOrderCleanupError) {
    if (error.code === 'FORBIDDEN') {
      return 'You do not have permission to delete purchase orders.'
    }
    if (error.code === 'UNAUTHENTICATED') {
      return 'Please sign in again to continue.'
    }
    if (error.code === 'WORKSPACE_REQUIRED' || error.code === 'WORKSPACE_NOT_FOUND') {
      return 'This workspace is not ready for cleanup right now.'
    }
  }

  return 'Unable to delete purchase orders right now. Please try again.'
}

function PreviewStat({ label, value }) {
  return (
    <div className="stock-order-cleanup-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function readInputValue(ref) {
  return `${ref.current?.value ?? ''}`.trim()
}

export function StockOrderCleanupDialog({
  workspaceId,
  onClose,
  onCompleted,
}) {
  const { user, session } = useAuth()
  const [phase, setPhase] = useState('loading') // loading | ready | empty | executing | success
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)
  const inFlightRef = useRef(false)

  const syncPasswordFromDom = () => {
    const domValue = readInputValue(passwordRef)
    if (domValue && domValue !== password) {
      setPassword(domValue)
    }
    return domValue || `${password}`.trim()
  }

  const confirmExact = (
    `${confirmText}` === PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE
    || readInputValue(confirmRef) === PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE
  )
  const hasOrders = (preview?.totalOrders ?? 0) > 0
  const showReceiveWarning = (preview?.ordersWithReceive ?? 0) > 0
    || preview?.hasReceiveFootprint === true
  const effectivePassword = `${password}`.trim() || readInputValue(passwordRef)
  const canSubmit = phase === 'ready'
    && hasOrders
    && confirmExact
    && effectivePassword.length > 0
    && !isBusy
    && !inFlightRef.current

  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      setPhase('loading')
      setError('')
      try {
        const next = await previewPurchaseOrderCleanup(workspaceId)
        if (cancelled) return
        setPreview(next)
        setPhase((next.totalOrders ?? 0) > 0 ? 'ready' : 'empty')
      } catch (loadError) {
        if (cancelled) return
        setError(friendlyCleanupError(loadError))
        setPhase('ready')
        setPreview(null)
      }
    }

    loadPreview()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  // Browser password managers often fill the DOM without firing React onChange.
  // Poll briefly while ready so the Delete action can enable after autofill.
  useEffect(() => {
    if (phase !== 'ready' || isBusy) return undefined

    const timer = window.setInterval(() => {
      const domPassword = readInputValue(passwordRef)
      const domConfirm = readInputValue(confirmRef)
      if (domPassword && domPassword !== password) {
        setPassword(domPassword)
      }
      if (domConfirm && domConfirm !== confirmText) {
        setConfirmText(domConfirm)
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [phase, isBusy, password, confirmText])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isBusy || phase === 'executing' || inFlightRef.current) return
        onClose?.()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBusy, onClose, phase])

  const handleDismiss = () => {
    if (isBusy || phase === 'executing' || inFlightRef.current) return
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()

    if (inFlightRef.current || isBusy || phase === 'executing') {
      return
    }

    const liveConfirm = readInputValue(confirmRef) || `${confirmText}`.trim()
    const livePassword = syncPasswordFromDom()
    const liveConfirmExact = liveConfirm === PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE

    if (phase !== 'ready' || !preview || !hasOrders) {
      setError('Purchase order preview is not ready yet.')
      return
    }

    if (!liveConfirmExact) {
      setError(`Type ${PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE} exactly to continue.`)
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
      const cleanupResult = await cleanupPurchaseOrderDocuments(workspaceId)
      setResult(cleanupResult)
      setPhase('success')
      setIsBusy(false)
      inFlightRef.current = false

      try {
        await onCompleted?.(cleanupResult)
      } catch (refreshError) {
        console.warn('[StockOrderCleanupDialog] Orders refresh after cleanup failed:', refreshError)
      }
    } catch (cleanupError) {
      setError(friendlyCleanupError(cleanupError))
      setPhase('ready')
      setIsBusy(false)
      inFlightRef.current = false
    }
  }

  return createPortal(
    <div
      className="employee-modal-backdrop stock-order-cleanup-backdrop task-modal-backdrop"
      onClick={handleDismiss}
    >
      <div
        className="employee-modal stock-order-cleanup-dialog task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-order-cleanup-title"
        aria-busy={isBusy || phase === 'loading' || phase === 'executing'}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Administrative cleanup</p>
            <h3 id="stock-order-cleanup-title">
              {phase === 'success' ? 'Cleanup complete' : 'Delete purchase orders'}
            </h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={handleDismiss}
            disabled={isBusy || phase === 'executing'}
            aria-label="Close purchase order cleanup"
          >
            ✕
          </button>
        </div>

        {phase === 'success' && result ? (
          <>
            <div className="stock-order-cleanup-body">
              <div className="stock-order-cleanup-success" role="status">
                <p className="stock-order-cleanup-copy">
                  <strong>Purchase Order cleanup completed.</strong>
                </p>
                <p className="stock-order-cleanup-copy">Deleted:</p>
                <ul className="stock-order-cleanup-success-list">
                  <li>{result.deletedOrders} order{result.deletedOrders === 1 ? '' : 's'}</li>
                  <li>{result.deletedOrderItems} order line{result.deletedOrderItems === 1 ? '' : 's'}</li>
                </ul>
                <p className="stock-order-cleanup-copy">
                  Inventory quantities were not modified.
                </p>
                <p className="stock-order-cleanup-copy">
                  Stock movement history remains intact.
                </p>
              </div>
            </div>
            <div className="modal-actions stock-order-cleanup-actions">
              <button type="button" className="primary-btn" onClick={handleDismiss}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form className="stock-order-cleanup-form" onSubmit={handleSubmit}>
            <div className="stock-order-cleanup-body">
              {phase === 'loading' ? (
                <p className="stock-order-cleanup-copy" role="status">Loading purchase order preview…</p>
              ) : null}

              {phase === 'empty' ? (
                <div className="stock-order-cleanup-empty" role="status">
                  <h4>No purchase orders to delete</h4>
                  <p>This workspace has no purchase order documents right now.</p>
                </div>
              ) : null}

              {(phase === 'ready' || phase === 'executing') && preview ? (
                <>
                  <p className="stock-order-cleanup-copy">
                    This permanently removes purchase order documents for this workspace.
                    It does not reverse inventory quantities.
                  </p>

                  <dl className="stock-order-cleanup-stats" aria-label="Purchase order cleanup preview">
                    <PreviewStat label="Total orders" value={preview.totalOrders} />
                    <PreviewStat label="Draft" value={preview.draftOrders} />
                    <PreviewStat label="Sent" value={preview.sentOrders} />
                    <PreviewStat label="Received" value={preview.receivedOrders} />
                    <PreviewStat label="Cancelled" value={preview.cancelledOrders} />
                    <PreviewStat label="Total order lines" value={preview.totalOrderItems} />
                    <PreviewStat label="Orders with receive" value={preview.ordersWithReceive} />
                  </dl>

                  {showReceiveWarning ? (
                    <div className="stock-order-cleanup-warning" role="alert">
                      <strong>These purchase orders have already updated inventory.</strong>
                      <p>
                        Deleting them removes only the purchase order documents.
                        Current stock quantities remain unchanged.
                        Stock movement history remains unchanged.
                      </p>
                    </div>
                  ) : null}

                  <label className="form-field stock-order-cleanup-confirm-field">
                    <span>
                      Type
                      {' '}
                      <strong>{PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE}</strong>
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
                        syncPasswordFromDom()
                      }}
                      disabled={isBusy}
                      aria-label="Typed confirmation phrase"
                    />
                  </label>

                  <label className="form-field stock-order-cleanup-password-field">
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

              {error ? (
                <p className="staff-status-banner stock-order-cleanup-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="modal-actions stock-order-cleanup-actions">
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
                className="primary-btn stock-order-cleanup-delete-btn"
                disabled={!canSubmit || phase === 'empty' || phase === 'loading' || !preview}
              >
                {phase === 'executing' || isBusy ? 'Deleting…' : 'Delete purchase orders'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
