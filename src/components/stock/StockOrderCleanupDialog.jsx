/**
 * P8.16.21 — Purchase Order document cleanup dialog (manager-only).
 * Document-only delete via P8.16.20 RPC. Never mutates quantities or movements.
 */
import { useEffect, useState } from 'react'
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

export function StockOrderCleanupDialog({
  workspaceId,
  onClose,
  onCompleted,
}) {
  const { user } = useAuth()
  const [phase, setPhase] = useState('loading') // loading | ready | empty | executing | success
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const confirmExact = confirmText === PURCHASE_ORDER_CLEANUP_CONFIRM_PHRASE
  const hasOrders = (preview?.totalOrders ?? 0) > 0
  const showReceiveWarning = (preview?.ordersWithReceive ?? 0) > 0
    || preview?.hasReceiveFootprint === true
  const canSubmit = phase === 'ready'
    && hasOrders
    && confirmExact
    && `${password}`.length > 0
    && !isBusy

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

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isBusy || phase === 'executing') return
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
    if (isBusy || phase === 'executing') return
    onClose?.()
  }

  const handleExecute = async () => {
    if (!canSubmit) return

    const email = `${user?.email ?? ''}`.trim()
    if (!email) {
      setError('Unable to verify your account right now.')
      return
    }

    setIsBusy(true)
    setError('')
    setPhase('executing')

    try {
      await signInWithPassword(email, password)
    } catch {
      setError('Incorrect password. Please try again.')
      setIsBusy(false)
      setPhase('ready')
      return
    }

    try {
      const cleanupResult = await cleanupPurchaseOrderDocuments(workspaceId)
      setResult(cleanupResult)
      setPhase('success')
      onCompleted?.(cleanupResult)
    } catch (cleanupError) {
      setError(friendlyCleanupError(cleanupError))
      setPhase('ready')
    } finally {
      setIsBusy(false)
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

          {phase === 'success' && result ? (
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
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  disabled={isBusy}
                  aria-label="Typed confirmation phrase"
                />
              </label>

              <label className="form-field stock-order-cleanup-password-field">
                <span>Confirm with your account password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
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
          {phase === 'success' ? (
            <button type="button" className="primary-btn" onClick={handleDismiss}>
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={handleDismiss}
                disabled={isBusy || phase === 'executing'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn stock-order-cleanup-delete-btn"
                onClick={handleExecute}
                disabled={!canSubmit || phase === 'empty' || phase === 'loading' || !preview}
              >
                {phase === 'executing' || isBusy ? 'Deleting…' : 'Delete purchase orders'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
