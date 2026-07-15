import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { validateLeaveDates } from '../../lib/leave/leaveValidation'
import { fetchPendingLeaveForWorkspace } from '../../services/leaveService'
import { ManagerLeaveDetailsDrawer } from './ManagerLeaveDetailsDrawer'

function formatLeaveTypeLabel(leaveType) {
  const normalized = `${leaveType ?? ''}`.trim().toLowerCase()
  if (!normalized) return 'Leave'
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

function formatSubmittedDate(createdAt) {
  const raw = `${createdAt ?? ''}`.trim()
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

function resolveEmployeeName(employeeId, employees = []) {
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
  if (!normalizedEmployeeId) return 'Unknown employee'

  const employee = employees.find((entry) => `${entry?.id ?? ''}`.trim() === normalizedEmployeeId)
  const name = `${employee?.name ?? employee?.fullName ?? ''}`.trim()
  return name || 'Unknown employee'
}

function buildInboxRows(pendingLeave = [], employees = []) {
  return pendingLeave.map((entry) => ({
    id: entry.id,
    status: entry.status,
    key: `${entry.startDate}-${entry.endDate}-${entry.leaveType}-${entry.employeeId}`,
    employeeName: resolveEmployeeName(entry.employeeId, employees),
    leaveTypeLabel: formatLeaveTypeLabel(entry.leaveType),
    startDate: entry.startDate,
    endDate: entry.endDate,
    durationLabel: formatDurationLabel(entry.startDate, entry.endDate),
    submittedDate: formatSubmittedDate(entry.createdAt),
    statusLabel: 'Pending',
    note: `${entry.note ?? ''}`.trim(),
  }))
}

function handleLeaveRowKeyDown(event, row, onSelectLeave) {
  if (event.key !== 'Enter' && event.key !== ' ') return

  event.preventDefault()
  onSelectLeave(row)
}

export function ManagerLeaveInbox({
  workspaceId = '',
  employees = [],
}) {
  const [pendingLeave, setPendingLeave] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [selectedLeave, setSelectedLeave] = useState(null)
  const pendingLeaveRequestIdRef = useRef(0)

  const loadPendingLeave = useCallback(async () => {
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    if (!normalizedWorkspaceId) {
      setPendingLeave([])
      setIsLoading(false)
      setErrorMessage('Workspace is required to load pending leave.')
      return
    }

    const requestId = pendingLeaveRequestIdRef.current + 1
    pendingLeaveRequestIdRef.current = requestId

    setIsLoading(true)
    setErrorMessage('')

    try {
      const records = await fetchPendingLeaveForWorkspace(normalizedWorkspaceId)
      if (pendingLeaveRequestIdRef.current !== requestId) return
      setPendingLeave(records)
    } catch (error) {
      if (pendingLeaveRequestIdRef.current !== requestId) return
      setPendingLeave([])
      setErrorMessage(error?.message || 'Unable to load pending leave requests right now.')
    } finally {
      if (pendingLeaveRequestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [workspaceId])

  useEffect(() => {
    loadPendingLeave()
  }, [loadPendingLeave])

  const handleLeaveApproved = () => {
    setSuccessMessage('Leave request approved.')
    setSelectedLeave(null)
    void loadPendingLeave()
  }

  const rows = useMemo(
    () => buildInboxRows(pendingLeave, employees),
    [pendingLeave, employees],
  )

  return (
    <section className="manager-leave-inbox panel staff-panel" aria-label="Pending leave requests">
      <style>{`
        .manager-leave-inbox {
          margin-bottom: 1rem;
        }

        .manager-leave-inbox-header {
          margin-bottom: 0.75rem;
        }

        .manager-leave-inbox-list {
          display: grid;
          gap: 0.75rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .manager-leave-inbox-row {
          border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
          border-radius: 12px;
          padding: 0.875rem 1rem;
        }

        .manager-leave-inbox-row.is-actionable {
          cursor: pointer;
        }

        .manager-leave-inbox-row.is-actionable:focus-visible {
          outline: 2px solid var(--focus-ring, #7aa2ff);
          outline-offset: 2px;
        }

        .manager-leave-inbox-row-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .manager-leave-inbox-employee {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }

        .manager-leave-inbox-meta {
          display: grid;
          gap: 0.35rem;
          margin: 0;
        }

        .manager-leave-inbox-meta-row {
          display: grid;
          grid-template-columns: 7.5rem 1fr;
          gap: 0.5rem;
          margin: 0;
        }

        .manager-leave-inbox-meta-row dt {
          margin: 0;
          color: var(--text-muted, #9aa3b2);
          font-size: 0.8125rem;
        }

        .manager-leave-inbox-meta-row dd {
          margin: 0;
          font-size: 0.875rem;
        }

        .manager-leave-inbox-empty {
          margin: 0;
          padding: 1rem 0 0.25rem;
          color: var(--text-muted, #9aa3b2);
        }
      `}</style>

      <div className="manager-leave-inbox-header">
        <p className="eyebrow">Leave</p>
        <h3>Pending requests</h3>
      </div>

      {isLoading ? (
        <div className="staff-status-banner" aria-live="polite">Loading pending leave requests…</div>
      ) : null}

      {!isLoading && errorMessage ? (
        <div className="staff-status-banner" role="alert">{errorMessage}</div>
      ) : null}

      {!isLoading && successMessage ? (
        <div className="staff-status-banner auth-banner-success" role="status">{successMessage}</div>
      ) : null}

      {!isLoading && !errorMessage && rows.length === 0 ? (
        <p className="manager-leave-inbox-empty">No pending leave requests.</p>
      ) : null}

      {!isLoading && !errorMessage && rows.length > 0 ? (
        <ul className="manager-leave-inbox-list">
          {rows.map((row) => (
            <li key={row.key}>
              <article
                className="manager-leave-inbox-row is-actionable"
                role="button"
                tabIndex={0}
                aria-label={`View leave request for ${row.employeeName}`}
                onClick={() => setSelectedLeave(row)}
                onKeyDown={(event) => handleLeaveRowKeyDown(event, row, setSelectedLeave)}
              >
                <div className="manager-leave-inbox-row-top">
                  <h4 className="manager-leave-inbox-employee">{row.employeeName}</h4>
                  <span className="status-pill pending">{row.statusLabel}</span>
                </div>

                <dl className="manager-leave-inbox-meta">
                  <div className="manager-leave-inbox-meta-row">
                    <dt>Leave type</dt>
                    <dd>{row.leaveTypeLabel}</dd>
                  </div>
                  <div className="manager-leave-inbox-meta-row">
                    <dt>Start date</dt>
                    <dd>{row.startDate}</dd>
                  </div>
                  <div className="manager-leave-inbox-meta-row">
                    <dt>End date</dt>
                    <dd>{row.endDate}</dd>
                  </div>
                  <div className="manager-leave-inbox-meta-row">
                    <dt>Duration</dt>
                    <dd>{row.durationLabel}</dd>
                  </div>
                  {row.submittedDate ? (
                    <div className="manager-leave-inbox-meta-row">
                      <dt>Submitted</dt>
                      <dd>{row.submittedDate}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      <ManagerLeaveDetailsDrawer
        leaveDetail={selectedLeave}
        workspaceId={workspaceId}
        onClose={() => setSelectedLeave(null)}
        onApproved={handleLeaveApproved}
      />
    </section>
  )
}
