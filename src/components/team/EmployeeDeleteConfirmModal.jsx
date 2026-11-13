import { useEscapeToClose } from '../../lib/useEscapeToClose'
import { t } from '../../i18n/i18n'

export function getEmployeeDeleteConfirmName(employee) {
  const name = `${employee?.name ?? ''}`.trim()
  return name || 'this employee'
}

export function EmployeeDeleteConfirmModal({
  employee = null,
  isDeleting = false,
  errorMessage = '',
  onCancel,
  onConfirm,
}) {
  useEscapeToClose(() => onCancel?.(), { enabled: Boolean(employee) && !isDeleting })

  if (!employee) return null

  const employeeName = getEmployeeDeleteConfirmName(employee)

  return (
    <div className="employee-modal-backdrop" onClick={onCancel}>
      <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">{t("Delete confirmation")}</p>
            <h3>{t("Delete employee")}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label={t("Close")}>
            ✕
          </button>
        </div>

        <p className="welcome-subtitle" style={{ marginTop: 0 }}>
          Are you sure you want to permanently delete
          {' '}
          <strong>{employeeName}</strong>
          ?
          {' '}
          This removes them from the team and closes their access to this venue.
          Past hours and messages are kept with their name. This action cannot be undone.
          {' '}
          To pause someone who may come back, use Disable instead.
        </p>

        {errorMessage ? (
          <p className="employee-delete-error" role="alert">{errorMessage}</p>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isDeleting}>
            {t("Cancel")}
          </button>
          <button type="button" className="primary-btn" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete Employee'}
          </button>
        </div>
      </div>
    </div>
  )
}
