export function getEmployeeDeleteConfirmName(employee) {
  const name = `${employee?.name ?? ''}`.trim()
  return name || 'this employee'
}

export function EmployeeDeleteConfirmModal({
  employee = null,
  isDeleting = false,
  onCancel,
  onConfirm,
}) {
  if (!employee) return null

  const employeeName = getEmployeeDeleteConfirmName(employee)

  return (
    <div className="employee-modal-backdrop" onClick={onCancel}>
      <div className="employee-modal" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Delete confirmation</p>
            <h3>Delete employee</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="welcome-subtitle" style={{ marginTop: 0 }}>
          Are you sure you want to permanently delete
          {' '}
          <strong>{employeeName}</strong>
          ?
          {' '}
          This action cannot be undone.
        </p>

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete Employee'}
          </button>
        </div>
      </div>
    </div>
  )
}
