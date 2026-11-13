import { useEffect, useRef, useState } from 'react'
import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { LEAVE_STATUS } from '../../lib/leave/leaveConstants'
import { validateLeaveDates } from '../../lib/leave/leaveValidation'
import { withdrawLeaveRequest } from '../../services/leaveService'
import { t } from '../../i18n/i18n'

function formatLeaveTypeLabel(leaveType) {
  const normalized = `${leaveType ?? ''}`.trim().toLowerCase()
  if (!normalized) return 'Leave'
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

function formatSubmittedDate(createdAt) {
  const raw = `${createdAt ?? ''}`.trim()
  if (!raw) return '—'

  if (raw.includes('T')) {
    return raw.split('T')[0]
  }

  return raw.slice(0, 10)
}

function formatDecisionDate(decidedAt) {
  const raw = `${decidedAt ?? ''}`.trim()
  if (!raw) return ''

  if (raw.includes('T')) {
    return raw.split('T')[0]
  }

  return raw.slice(0, 10)
}

function formatDurationLabel(startDate, endDate) {
  const validation = validateLeaveDates({ startDate, endDate })
  if (!validation.ok) return '—'

  const days = validation.durationDays
  return `${days} day${days === 1 ? '' : 's'}`
}

function formatStatusLabel(status) {
  const normalized = `${status ?? ''}`.trim().toLowerCase()
  if (!normalized) return 'Unknown'

  if (normalized === LEAVE_STATUS.PENDING) return 'Pending'
  if (normalized === LEAVE_STATUS.APPROVED) return 'Approved'
  if (normalized === LEAVE_STATUS.REJECTED) return 'Rejected'
  if (normalized === LEAVE_STATUS.CANCELLED) return 'Cancelled'

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

function resolveStatusPillClass(status) {
  const normalized = `${status ?? ''}`.trim().toLowerCase()
  if (normalized === LEAVE_STATUS.APPROVED) return 'approved'
  if (normalized === LEAVE_STATUS.REJECTED) return 'rejected'
  if (normalized === LEAVE_STATUS.CANCELLED) return 'cancelled'
  return 'pending'
}

export function LeaveHistoryDetailsModal({
  entry,
  workspaceId = '',
  onClose,
  onWithdrawn,
}) {
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [isWithdrawPending, setIsWithdrawPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const withdrawInFlightRef = useRef(false)

  useEffect(() => {
    if (!entry) {
      setConfirmWithdraw(false)
      setIsWithdrawPending(false)
      setErrorMessage('')
      withdrawInFlightRef.current = false
      return undefined
    }

    setConfirmWithdraw(false)
    setIsWithdrawPending(false)
    setErrorMessage('')
    withdrawInFlightRef.current = false
  }, [entry])

  useEscapeToClose(() => {
    if (confirmWithdraw) {
      setConfirmWithdraw(false)
      return
    }
    onClose?.()
  }, { enabled: Boolean(entry) && !isWithdrawPending })

  if (!entry) return null

  const status = `${entry.status ?? ''}`.trim().toLowerCase()
  const noteText = `${entry.note ?? ''}`.trim()
  const decisionDate = formatDecisionDate(entry.decidedAt)
  const rejectionReason = `${entry.decisionNote ?? ''}`.trim()
  const isPending = status === LEAVE_STATUS.PENDING

  const handleClose = () => {
    if (isWithdrawPending) return
    onClose?.()
  }

  const handleConfirmCancel = () => {
    if (isWithdrawPending) return
    setConfirmWithdraw(false)
  }

  const handleWithdrawClick = () => {
    if (isWithdrawPending) return
    setErrorMessage('')
    setConfirmWithdraw(true)
  }

  const handleConfirmWithdraw = async () => {
    if (isWithdrawPending || withdrawInFlightRef.current) return

    withdrawInFlightRef.current = true
    setIsWithdrawPending(true)
    setErrorMessage('')

    try {
      await withdrawLeaveRequest(workspaceId, entry.id)
      setConfirmWithdraw(false)
      onWithdrawn?.()
    } catch (error) {
      withdrawInFlightRef.current = false
      setIsWithdrawPending(false)
      setConfirmWithdraw(false)
      setErrorMessage(error?.message || t("Unable to withdraw the leave request right now."))
    }
  }

  return (
    <>
    <div className="employee-modal-backdrop leave-history-details-backdrop" onClick={handleClose}>
      <div
        className="employee-modal blend-compact-modal leave-history-details-modal is-responsive-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-history-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <style>{`
          .leave-history-details-modal .icon-btn {
            min-height: 44px;
            min-width: 44px;
          }

          .leave-history-details-body {
            display: grid;
            gap: 1rem;
            max-height: min(60vh, 28rem);
            overflow-y: auto;
          }

          .leave-history-details-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .leave-history-details-title-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .leave-history-details-name {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
          }

          .leave-history-details-fields {
            display: grid;
            gap: 0.5rem;
            margin: 0;
          }

          .leave-history-details-field {
            display: grid;
            grid-template-columns: 7.5rem 1fr;
            gap: 0.5rem;
            margin: 0;
          }

          .leave-history-details-field dt {
            margin: 0;
            color: var(--text-muted, #9aa3b2);
            font-size: 0.8125rem;
          }

          .leave-history-details-field dd {
            margin: 0;
            font-size: 0.875rem;
          }

          .leave-history-details-section-title {
            margin: 0 0 0.5rem;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted, #9aa3b2);
          }

          .leave-history-details-note {
            margin: 0;
            font-size: 0.875rem;
            line-height: 1.5;
            white-space: pre-wrap;
          }

          .leave-history-details-note.is-empty,
          .leave-history-details-status-copy.is-muted {
            color: var(--text-muted, #9aa3b2);
            font-style: italic;
          }

          .leave-history-details-status-copy {
            margin: 0;
            font-size: 0.875rem;
            line-height: 1.5;
          }

          .leave-history-details-modal .status-pill.pending {
            color: var(--one-warning);
            background: var(--one-warning-bg);
          }

          .leave-history-details-modal .status-pill.approved {
            color: var(--one-success);
            background: var(--one-success-bg);
          }

          .leave-history-details-modal .status-pill.rejected {
            color: var(--one-danger);
            background: var(--one-danger-bg);
          }

          .leave-history-details-modal .status-pill.cancelled {
            color: var(--one-info);
            background: var(--one-info-bg);
          }

          .leave-history-details-footer {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
            padding-top: 0.25rem;
          }
        `}</style>

        <div className="drawer-header leave-history-details-header">
          <div>
            <p className="eyebrow">{t("Leave history")}</p>
            <h3 id="leave-history-details-title">{t("Leave request details")}</h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={handleClose}
            disabled={isWithdrawPending}
            aria-label={t("Close leave request details")}
          >
            ✕
          </button>
        </div>

        <div className="leave-history-details-body">
          <div className="leave-history-details-title-row">
            <h4 className="leave-history-details-name">{formatLeaveTypeLabel(entry.leaveType)}</h4>
            <span className={`status-pill ${resolveStatusPillClass(status)}`}>
              {formatStatusLabel(status)}
            </span>
          </div>

          <section>
            <h5 className="leave-history-details-section-title">{t("Request details")}</h5>
            <dl className="leave-history-details-fields">
              <div className="leave-history-details-field">
                <dt>{t("Start date")}</dt>
                <dd>{entry.startDate}</dd>
              </div>
              <div className="leave-history-details-field">
                <dt>{t("End date")}</dt>
                <dd>{entry.endDate}</dd>
              </div>
              <div className="leave-history-details-field">
                <dt>{t("Duration")}</dt>
                <dd>{formatDurationLabel(entry.startDate, entry.endDate)}</dd>
              </div>
              <div className="leave-history-details-field">
                <dt>{t("Submitted")}</dt>
                <dd>{formatSubmittedDate(entry.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h5 className="leave-history-details-section-title">{t("Employee note")}</h5>
            <p className={`leave-history-details-note${noteText ? '' : ' is-empty'}`}>
              {noteText || t("No note provided.")}
            </p>
          </section>

          {status === LEAVE_STATUS.PENDING ? (
            <section>
              <h5 className="leave-history-details-section-title">{t("Decision")}</h5>
              <p className="leave-history-details-status-copy is-muted">{t("Awaiting manager review.")}</p>
            </section>
          ) : null}

          {status === LEAVE_STATUS.APPROVED ? (
            <section>
              <h5 className="leave-history-details-section-title">{t("Decision")}</h5>
              {decisionDate ? (
                <dl className="leave-history-details-fields">
                  <div className="leave-history-details-field">
                    <dt>{t("Decision date")}</dt>
                    <dd>{decisionDate}</dd>
                  </div>
                </dl>
              ) : null}
            </section>
          ) : null}

          {status === LEAVE_STATUS.REJECTED ? (
            <section>
              <h5 className="leave-history-details-section-title">{t("Decision")}</h5>
              {decisionDate ? (
                <dl className="leave-history-details-fields">
                  <div className="leave-history-details-field">
                    <dt>{t("Decision date")}</dt>
                    <dd>{decisionDate}</dd>
                  </div>
                </dl>
              ) : null}
              <h5 className="leave-history-details-section-title">{t("Rejection reason")}</h5>
              <p className={`leave-history-details-note${rejectionReason ? '' : ' is-empty'}`}>
                {rejectionReason || t("No rejection reason provided.")}
              </p>
            </section>
          ) : null}

          {status === LEAVE_STATUS.CANCELLED ? (
            <section>
              <h5 className="leave-history-details-section-title">{t("Decision")}</h5>
              {decisionDate ? (
                <dl className="leave-history-details-fields">
                  <div className="leave-history-details-field">
                    <dt>{t("Decision date")}</dt>
                    <dd>{decisionDate}</dd>
                  </div>
                </dl>
              ) : null}
            </section>
          ) : null}

          {errorMessage ? (
            <div className="staff-status-banner" role="alert">{errorMessage}</div>
          ) : null}

          {isPending ? (
            <div className="leave-history-details-footer">
              <button
                type="button"
                className="ghost-btn leave-history-withdraw-btn"
                onClick={handleWithdrawClick}
                disabled={isWithdrawPending}
              >
                {t("Withdraw Request")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>

    {confirmWithdraw ? (
      <div className="employee-modal-backdrop" onClick={handleConfirmCancel}>
        <div
          className="employee-modal blend-compact-modal leave-history-withdraw-confirm-modal is-responsive-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-history-withdraw-confirm-title"
          aria-busy={isWithdrawPending}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="drawer-header">
            <div>
              <p className="eyebrow">{t("Leave withdrawal")}</p>
              <h3 id="leave-history-withdraw-confirm-title">{t("Withdraw leave request?")}</h3>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={handleConfirmCancel}
              disabled={isWithdrawPending}
              aria-label={t("Close withdrawal confirmation")}
            >
              ✕
            </button>
          </div>

          <p className="leave-history-withdraw-confirm-copy">
            {t("This will withdraw your pending leave request and cannot be undone from this screen.")}
          </p>

          <div className="modal-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={handleConfirmCancel}
              disabled={isWithdrawPending}
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={handleConfirmWithdraw}
              disabled={isWithdrawPending}
            >
              {isWithdrawPending ? 'Withdrawing…' : 'Withdraw'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
