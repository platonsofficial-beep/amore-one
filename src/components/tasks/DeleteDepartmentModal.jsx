export default function DeleteDepartmentModal({
  isOpen,
  departmentName = '',
  onClose,
  onConfirm,
  isDeleting = false,
}) {
  if (!isOpen) return null

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-department-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Department</p>
            <h3 id="delete-department-title">Delete department?</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close delete department dialog">
            ✕
          </button>
        </div>

        <div className="task-delete-department-body">
          <p>
            This will remove the department from the board. Existing tasks and templates in this department will be moved to Custom / Unassigned Department.
          </p>
          {departmentName ? (
            <p className="task-delete-department-name">
              <strong>{departmentName}</strong>
            </p>
          ) : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="primary-btn task-delete-department-confirm-btn" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete Department'}
          </button>
        </div>
      </div>
    </div>
  )
}
