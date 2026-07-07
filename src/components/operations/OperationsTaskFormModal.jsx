import { useState } from 'react'
import {
  buildEmptyOperationsTaskForm,
  getOperationsCategoryLabel,
  OPERATIONS_CATEGORIES,
  OPERATIONS_PRIORITIES,
  operationsTaskToForm,
  validateOperationsTaskForm,
} from '../../lib/operationsUtils'
import { TIME_INPUT_PROPS } from '../../lib/timeFormatUtils'

export function OperationsTaskFormModal({
  isOpen,
  task = null,
  todayKey = '',
  employees = [],
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => (
    task ? operationsTaskToForm(task) : buildEmptyOperationsTaskForm(todayKey)
  ))
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateOperationsTaskForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setError('')
      await onSubmit({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        assignedTo: form.assignedTo || null,
        dueDate: form.dueDate || null,
        dueTime: form.dueTime || null,
        repeatRule: '',
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save task right now.')
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop operations-form-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet operations-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-task-form-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Operations task</p>
            <h3 id="operations-task-form-title">{task ? 'Edit task' : 'Create task'}</h3>
          </div>
          <button type="button" className="icon-btn operations-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="employee-form operations-form" onSubmit={handleSubmit}>
          <label className="form-field full-width">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. Check walk-in fridge temperatures"
              required
              autoFocus
            />
          </label>

          <label className="form-field full-width">
            <span>Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Optional details for the team"
            />
          </label>

          <div className="form-grid">
            <label className="form-field">
              <span>Category</span>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              >
                {OPERATIONS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{getOperationsCategoryLabel(category)}</option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              >
                {OPERATIONS_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Assign to</span>
              <select
                value={form.assignedTo}
                onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))}
              >
                <option value="">Unassigned</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name ?? employee.name ?? 'Employee'}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Due date</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
              />
            </label>

            <label className="form-field">
              <span>Due time</span>
              <input
                {...TIME_INPUT_PROPS}
                value={form.dueTime}
                onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
              />
            </label>
          </div>

          <label className="form-field full-width operations-repeat-placeholder">
            <span>Repeat rules</span>
            <input
              value=""
              disabled
              placeholder="Coming soon — daily, weekly, and shift-based repeats"
              aria-describedby="operations-repeat-help"
            />
            <span id="operations-repeat-help" className="operations-field-help">
              Repeat scheduling will be available in a future update.
            </span>
          </label>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn operations-form-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn operations-form-action" disabled={isSaving}>
              {isSaving ? 'Saving…' : task ? 'Save task' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
