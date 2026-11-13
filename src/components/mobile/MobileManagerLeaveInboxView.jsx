import { ManagerLeaveInbox } from '../team/ManagerLeaveInbox'
import { t } from '../../i18n/i18n'

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
          {t("‹ Back")}
        </button>
        <h1>{t("Leave inbox")}</h1>
      </header>

      <ManagerLeaveInbox workspaceId={workspaceId} employees={employees} />
    </div>
  )
}
