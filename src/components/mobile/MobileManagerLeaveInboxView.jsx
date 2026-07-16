import { ManagerLeaveInbox } from '../team/ManagerLeaveInbox'

/**
 * Presentational mobile shell around the shared ManagerLeaveInbox.
 * Business logic (fetch, approve, reject, drawer) stays in the shared components.
 */
export function MobileManagerLeaveInboxView({
  workspaceId = '',
  employees = [],
  onBack,
}) {
  return (
    <div className="mobile-screen mobile-manager-leave-inbox">
      <header className="mobile-profile-header">
        <button type="button" className="mobile-back-btn" onClick={onBack}>
          ‹ Back
        </button>
        <h1>Leave inbox</h1>
      </header>

      <ManagerLeaveInbox workspaceId={workspaceId} employees={employees} />
    </div>
  )
}
