import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { t } from '../../i18n/i18n'

export function EmployeePostHireInvitePrompt({
  employee = null,
  isOpen = false,
  onInviteNow,
  onLater,
}) {
  useEscapeToClose(() => onLater?.(), { enabled: Boolean(isOpen && employee) })

  if (!isOpen || !employee) return null

  const employeeName = `${employee.name ?? ''}`.trim() || 'this employee'

  return (
    <div
      className="employee-modal-backdrop"
      onClick={onLater}
      role="presentation"
    >
      <div
        className="employee-modal is-responsive-sheet employee-post-hire-invite-prompt"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-post-hire-invite-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">{t("Team")}</p>
            <h3 id="employee-post-hire-invite-title">{t("Employee created successfully.")}</h3>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onLater}
            aria-label={t("Close")}
          >
            ✕
          </button>
        </div>

        <p className="welcome-subtitle" style={{ marginTop: 0 }}>
          Would you like to invite {employeeName} to ONE now?
        </p>

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onLater}>
            {t("Later")}
          </button>
          <button type="button" className="primary-btn" onClick={onInviteNow}>
            {t("Invite Now")}
          </button>
        </div>
      </div>
    </div>
  )
}
