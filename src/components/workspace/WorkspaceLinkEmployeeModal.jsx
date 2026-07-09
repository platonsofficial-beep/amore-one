function resolveEmployeeLabel(employee) {
  const name = `${employee?.name ?? employee?.fullName ?? ''}`.trim() || 'Unnamed employee'
  const position = `${employee?.primaryPosition ?? employee?.position ?? ''}`.trim()
  return position ? `${name} · ${position}` : name
}

export function WorkspaceLinkEmployeeModal({
  isOpen,
  employees = [],
  selectedEmployeeId = '',
  isSaving = false,
  errorMessage = '',
  onSelectEmployeeId,
  onClose,
  onSave,
}) {
  if (!isOpen) return null

  const sortedEmployees = [...employees].sort((left, right) => {
    const leftName = `${left?.name ?? left?.fullName ?? ''}`.trim().toLowerCase()
    const rightName = `${right?.name ?? right?.fullName ?? ''}`.trim().toLowerCase()
    return leftName.localeCompare(rightName)
  })

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div className="employee-modal blend-compact-modal workspace-link-employee-modal is-responsive-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Workspace member</p>
            <h3>Link employee</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="workspace-link-employee-body">
          <p className="workspace-link-employee-copy">
            Connect your signed-in workspace member to an existing staff record.
          </p>

          <label className="form-field full-width">
            <span>Employee</span>
            <select
              value={selectedEmployeeId}
              onChange={(event) => onSelectEmployeeId?.(event.target.value)}
              disabled={isSaving || sortedEmployees.length === 0}
            >
              <option value="">
                {sortedEmployees.length === 0 ? 'No employees available' : 'Select employee'}
              </option>
              {sortedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {resolveEmployeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          {errorMessage ? (
            <p className="workspace-link-employee-error" role="alert">{errorMessage}</p>
          ) : null}
        </div>

        <div className="drawer-footer workspace-link-employee-footer">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={onSave}
            disabled={isSaving || !selectedEmployeeId || sortedEmployees.length === 0}
          >
            {isSaving ? 'Saving…' : 'Save link'}
          </button>
        </div>
      </div>
    </div>
  )
}
