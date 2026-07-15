import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { LEAVE_STATUS } from '../../lib/leave/leaveConstants'
import { validateLeaveDates } from '../../lib/leave/leaveValidation'
import { fetchEmployeeLeaveHistory } from '../../services/leaveService'
import { LeaveHistoryDetailsModal } from './LeaveHistoryDetailsModal'

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

function buildHistoryRowKey(entry) {
  return [
    entry.startDate,
    entry.endDate,
    entry.leaveType,
    entry.status,
    entry.createdAt,
  ].join('-')
}

function handleHistoryRowKeyDown(event, entry, onSelectEntry) {
  if (event.key !== 'Enter' && event.key !== ' ') return

  event.preventDefault()
  onSelectEntry(entry)
}

export function LeaveHistoryPanel({
  workspaceId = '',
  isActive = true,
}) {
  const { membership } = useAuth()
  const employeeId = `${membership?.employeeId ?? ''}`.trim()

  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [selectedEntry, setSelectedEntry] = useState(null)
  const historyRequestIdRef = useRef(0)

  const loadHistory = useCallback(async () => {
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

    if (!isActive || !normalizedWorkspaceId || !employeeId) {
      setRecords([])
      setIsLoading(false)
      setErrorMessage('')
      return
    }

    const requestId = historyRequestIdRef.current + 1
    historyRequestIdRef.current = requestId

    setIsLoading(true)
    setErrorMessage('')

    try {
      const history = await fetchEmployeeLeaveHistory(normalizedWorkspaceId, employeeId)
      if (historyRequestIdRef.current !== requestId) return
      setRecords(history)
    } catch (error) {
      if (historyRequestIdRef.current !== requestId) return
      setRecords([])
      setErrorMessage(error?.message || 'Unable to load leave history right now.')
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [employeeId, isActive, workspaceId])

  const handleWithdrawn = useCallback(() => {
    setSelectedEntry(null)
    setSuccessMessage('Leave request withdrawn.')
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  return (
    <section className="leave-history-panel" aria-label="My leave history">
      <style>{`
        .leave-history-panel {
          display: grid;
          gap: 0.75rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
        }

        .leave-history-panel-title {
          margin: 0;
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted, #9aa3b2);
        }

        .leave-history-list {
          display: grid;
          gap: 0.75rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .leave-history-row {
          border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
          border-radius: 12px;
          padding: 0.875rem 1rem;
        }

        .leave-history-row.is-actionable {
          cursor: pointer;
        }

        .leave-history-row.is-actionable:focus-visible {
          outline: 2px solid var(--focus-ring, #7aa2ff);
          outline-offset: 2px;
        }

        .leave-history-row-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .leave-history-leave-type {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }

        .leave-history-meta {
          display: grid;
          gap: 0.35rem;
          margin: 0;
        }

        .leave-history-meta-row {
          display: grid;
          grid-template-columns: 7.5rem 1fr;
          gap: 0.5rem;
          margin: 0;
        }

        .leave-history-meta-row dt {
          margin: 0;
          color: var(--text-muted, #9aa3b2);
          font-size: 0.8125rem;
        }

        .leave-history-meta-row dd {
          margin: 0;
          font-size: 0.875rem;
        }

        .leave-history-note-indicator {
          margin: 0.5rem 0 0;
          color: var(--text-muted, #9aa3b2);
          font-size: 0.8125rem;
          font-style: italic;
        }

        .leave-history-empty {
          margin: 0;
          color: var(--text-muted, #9aa3b2);
        }

        .leave-history-panel .status-pill.pending {
          color: #ffd8a8;
          background: rgba(255, 152, 0, 0.16);
        }

        .leave-history-panel .status-pill.approved {
          color: #d9f6cf;
          background: rgba(76, 175, 80, 0.14);
        }

        .leave-history-panel .status-pill.rejected {
          color: #ffcccc;
          background: rgba(244, 67, 54, 0.16);
        }

        .leave-history-panel .status-pill.cancelled {
          color: #d6e4ff;
          background: rgba(66, 133, 244, 0.16);
        }
      `}</style>

      <h4 className="leave-history-panel-title">My Leave History</h4>

      {isLoading ? (
        <div className="staff-status-banner" aria-live="polite">Loading leave history…</div>
      ) : null}

      {!isLoading && errorMessage ? (
        <div className="staff-status-banner" role="alert">{errorMessage}</div>
      ) : null}

      {!isLoading && successMessage ? (
        <div className="staff-status-banner auth-banner-success" role="status">{successMessage}</div>
      ) : null}

      {!isLoading && !errorMessage && records.length === 0 ? (
        <p className="leave-history-empty">You haven&apos;t submitted any leave requests yet.</p>
      ) : null}

      {!isLoading && !errorMessage && records.length > 0 ? (
        <ul className="leave-history-list">
          {records.map((entry) => {
            const noteText = `${entry.note ?? ''}`.trim()

            return (
              <li key={buildHistoryRowKey(entry)}>
                <article
                  className="leave-history-row is-actionable"
                  role="button"
                  tabIndex={0}
                  aria-label={`View leave request details for ${formatLeaveTypeLabel(entry.leaveType)}`}
                  onClick={() => setSelectedEntry(entry)}
                  onKeyDown={(event) => handleHistoryRowKeyDown(event, entry, setSelectedEntry)}
                >
                  <div className="leave-history-row-top">
                    <h5 className="leave-history-leave-type">{formatLeaveTypeLabel(entry.leaveType)}</h5>
                    <span className={`status-pill ${resolveStatusPillClass(entry.status)}`}>
                      {formatStatusLabel(entry.status)}
                    </span>
                  </div>

                  <dl className="leave-history-meta">
                    <div className="leave-history-meta-row">
                      <dt>Start date</dt>
                      <dd>{entry.startDate}</dd>
                    </div>
                    <div className="leave-history-meta-row">
                      <dt>End date</dt>
                      <dd>{entry.endDate}</dd>
                    </div>
                    <div className="leave-history-meta-row">
                      <dt>Duration</dt>
                      <dd>{formatDurationLabel(entry.startDate, entry.endDate)}</dd>
                    </div>
                    <div className="leave-history-meta-row">
                      <dt>Submitted</dt>
                      <dd>{formatSubmittedDate(entry.createdAt)}</dd>
                    </div>
                  </dl>

                  {noteText ? (
                    <p className="leave-history-note-indicator">Includes note</p>
                  ) : null}
                </article>
              </li>
            )
          })}
        </ul>
      ) : null}

      <LeaveHistoryDetailsModal
        entry={selectedEntry}
        workspaceId={workspaceId}
        onClose={() => setSelectedEntry(null)}
        onWithdrawn={handleWithdrawn}
      />
    </section>
  )
}
