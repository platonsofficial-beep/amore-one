import { useEffect, useRef, useState } from 'react'
import { approveLeaveRequest, rejectLeaveRequest } from '../../services/leaveService'

function normalizeRejectionReason(value) {
  return `${value ?? ''}`.trim()
}

export function ManagerLeaveDetailsDrawer({
  leaveDetail,
  workspaceId = '',
  onClose,
  onApproved,
  onRejected,
}) {
  const [confirmAction, setConfirmAction] = useState(null)
  const [isActionPending, setIsActionPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionReasonError, setRejectionReasonError] = useState('')
  const actionInFlightRef = useRef(false)

  useEffect(() => {
    if (!leaveDetail) {
      setConfirmAction(null)
      setIsActionPending(false)
      setErrorMessage('')
      setRejectionReason('')
      setRejectionReasonError('')
      actionInFlightRef.current = false
      return undefined
    }

    setConfirmAction(null)
    setIsActionPending(false)
    setErrorMessage('')
    setRejectionReason('')
    setRejectionReasonError('')
    actionInFlightRef.current = false
  }, [leaveDetail])

  useEffect(() => {
    if (!leaveDetail) return undefined

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || isActionPending) return

      event.preventDefault()

      if (confirmAction) {
        setConfirmAction(null)
        return
      }

      onClose?.()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [confirmAction, isActionPending, leaveDetail, onClose])

  if (!leaveDetail) return null

  const noteText = `${leaveDetail.note ?? ''}`.trim()
  const isPending = `${leaveDetail.status ?? leaveDetail.statusLabel ?? ''}`.trim().toLowerCase() === 'pending'
  const normalizedRejectionReason = normalizeRejectionReason(rejectionReason)
  const hasRejectionReason = Boolean(normalizedRejectionReason)

  const handleClose = () => {
    if (isActionPending) return
    onClose?.()
  }

  const handleConfirmCancel = () => {
    if (isActionPending) return
    setConfirmAction(null)
  }

  const handleApproveClick = () => {
    if (isActionPending) return
    setErrorMessage('')
    setRejectionReasonError('')
    setConfirmAction('approve')
  }

  const handleRejectClick = () => {
    if (isActionPending) return
    setErrorMessage('')

    if (!hasRejectionReason) {
      setRejectionReasonError('A rejection reason is required.')
      return
    }

    setRejectionReasonError('')
    setConfirmAction('reject')
  }

  const handleConfirmApprove = async () => {
    if (isActionPending || actionInFlightRef.current) return

    actionInFlightRef.current = true
    setIsActionPending(true)
    setErrorMessage('')

    try {
      await approveLeaveRequest(workspaceId, leaveDetail.id)
      setConfirmAction(null)
      onApproved?.()
      onClose?.()
    } catch (error) {
      actionInFlightRef.current = false
      setIsActionPending(false)
      setConfirmAction(null)
      setErrorMessage(error?.message || 'Unable to approve the leave request right now.')
    }
  }

  const handleConfirmReject = async () => {
    if (isActionPending || actionInFlightRef.current) return

    const trimmedReason = normalizeRejectionReason(rejectionReason)
    if (!trimmedReason) {
      setRejectionReasonError('A rejection reason is required.')
      setConfirmAction(null)
      return
    }

    actionInFlightRef.current = true
    setIsActionPending(true)
    setErrorMessage('')

    try {
      await rejectLeaveRequest(workspaceId, leaveDetail.id, trimmedReason)
      setConfirmAction(null)
      onRejected?.()
      onClose?.()
    } catch (error) {
      actionInFlightRef.current = false
      setIsActionPending(false)
      setConfirmAction(null)
      setErrorMessage(error?.message || 'Unable to reject the leave request right now.')
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={handleClose} />
      <aside
        className="employee-drawer manager-leave-details-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-leave-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <style>{`
          .manager-leave-details-drawer {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .manager-leave-details-drawer-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .manager-leave-details-drawer-identity {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .manager-leave-details-drawer-name {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
          }

          .manager-leave-details-drawer-body {
            display: grid;
            gap: 1rem;
          }

          .manager-leave-details-drawer-section-title {
            margin: 0 0 0.5rem;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted, #9aa3b2);
          }

          .manager-leave-details-drawer-fields {
            display: grid;
            gap: 0.5rem;
            margin: 0;
          }

          .manager-leave-details-drawer-field {
            display: grid;
            grid-template-columns: 7.5rem 1fr;
            gap: 0.5rem;
            margin: 0;
          }

          .manager-leave-details-drawer-field dt {
            margin: 0;
            color: var(--text-muted, #9aa3b2);
            font-size: 0.8125rem;
          }

          .manager-leave-details-drawer-field dd {
            margin: 0;
            font-size: 0.875rem;
          }

          .manager-leave-details-drawer-note {
            margin: 0;
            font-size: 0.875rem;
            line-height: 1.5;
          }

          .manager-leave-details-drawer-note.is-empty {
            color: var(--text-muted, #9aa3b2);
            font-style: italic;
          }

          .manager-leave-rejection-reason-field {
            display: grid;
            gap: 0.5rem;
          }

          .manager-leave-rejection-reason-field span {
            font-size: 0.875rem;
          }

          .manager-leave-rejection-reason {
            min-height: 88px;
            resize: vertical;
          }

          .manager-leave-rejection-reason-error {
            margin: 0;
            color: var(--danger-text, #ff8f8f);
            font-size: 0.8125rem;
          }

          .manager-leave-details-drawer-footer {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
            margin-top: auto;
            padding-top: 0.5rem;
          }

          .manager-leave-details-drawer-footer .ghost-btn,
          .manager-leave-details-drawer-footer .primary-btn {
            min-height: 44px;
            width: 100%;
          }
        `}</style>

        <div className="manager-leave-details-drawer-top">
          <p className="eyebrow">Leave request</p>
          <button
            type="button"
            className="icon-btn"
            onClick={handleClose}
            disabled={isActionPending}
            aria-label="Close leave request details"
          >
            ✕
          </button>
        </div>

        <header className="manager-leave-details-drawer-identity">
          <h3 id="manager-leave-details-title" className="manager-leave-details-drawer-name">
            {leaveDetail.employeeName}
          </h3>
          <span className="status-pill pending">{leaveDetail.statusLabel}</span>
        </header>

        <div className="manager-leave-details-drawer-body">
          <section>
            <h4 className="manager-leave-details-drawer-section-title">Request details</h4>
            <dl className="manager-leave-details-drawer-fields">
              <div className="manager-leave-details-drawer-field">
                <dt>Leave type</dt>
                <dd>{leaveDetail.leaveTypeLabel}</dd>
              </div>
              <div className="manager-leave-details-drawer-field">
                <dt>Start date</dt>
                <dd>{leaveDetail.startDate}</dd>
              </div>
              <div className="manager-leave-details-drawer-field">
                <dt>End date</dt>
                <dd>{leaveDetail.endDate}</dd>
              </div>
              <div className="manager-leave-details-drawer-field">
                <dt>Duration</dt>
                <dd>{leaveDetail.durationLabel}</dd>
              </div>
              {leaveDetail.submittedDate ? (
                <div className="manager-leave-details-drawer-field">
                  <dt>Submitted</dt>
                  <dd>{leaveDetail.submittedDate}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h4 className="manager-leave-details-drawer-section-title">Note</h4>
            <p className={`manager-leave-details-drawer-note${noteText ? '' : ' is-empty'}`}>
              {noteText || 'No note provided.'}
            </p>
          </section>

          {isPending ? (
            <section>
              <label className="manager-leave-rejection-reason-field form-field full-width">
                <span>Rejection reason</span>
                <textarea
                  className="manager-leave-rejection-reason"
                  value={rejectionReason}
                  onChange={(event) => {
                    setRejectionReason(event.target.value)
                    if (rejectionReasonError) {
                      setRejectionReasonError('')
                    }
                  }}
                  placeholder="Enter the reason for rejecting this leave request..."
                  rows={3}
                  disabled={isActionPending}
                  aria-invalid={rejectionReasonError ? 'true' : 'false'}
                />
                {rejectionReasonError ? (
                  <p className="manager-leave-rejection-reason-error" role="alert">{rejectionReasonError}</p>
                ) : null}
              </label>
            </section>
          ) : null}

          {errorMessage ? (
            <div className="staff-status-banner" role="alert">{errorMessage}</div>
          ) : null}

          {isPending ? (
            <div className="manager-leave-details-drawer-footer">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleRejectClick}
                disabled={isActionPending || !hasRejectionReason}
              >
                Reject Leave
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleApproveClick}
                disabled={isActionPending}
              >
                Approve Leave
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {confirmAction === 'approve' ? (
        <div className="employee-modal-backdrop" onClick={handleConfirmCancel}>
          <div
            className="employee-modal blend-compact-modal manager-leave-approve-confirm-modal is-responsive-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-leave-approve-confirm-title"
            aria-busy={isActionPending}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Leave approval</p>
                <h3 id="manager-leave-approve-confirm-title">Approve leave request?</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={handleConfirmCancel}
                disabled={isActionPending}
                aria-label="Close approval confirmation"
              >
                ✕
              </button>
            </div>

            <p className="manager-leave-approve-confirm-copy">
              This will approve the leave request and cannot be undone from this screen.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleConfirmCancel}
                disabled={isActionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmApprove}
                disabled={isActionPending}
              >
                {isActionPending ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction === 'reject' ? (
        <div className="employee-modal-backdrop" onClick={handleConfirmCancel}>
          <div
            className="employee-modal blend-compact-modal manager-leave-reject-confirm-modal is-responsive-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-leave-reject-confirm-title"
            aria-busy={isActionPending}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Leave rejection</p>
                <h3 id="manager-leave-reject-confirm-title">Reject leave request?</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={handleConfirmCancel}
                disabled={isActionPending}
                aria-label="Close rejection confirmation"
              >
                ✕
              </button>
            </div>

            <p className="manager-leave-reject-confirm-copy">
              This will reject the leave request and cannot be undone from this screen.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleConfirmCancel}
                disabled={isActionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmReject}
                disabled={isActionPending}
              >
                {isActionPending ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
