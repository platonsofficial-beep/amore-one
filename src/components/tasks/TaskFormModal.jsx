import { useEffect, useState } from 'react'
import { buildTaskForm } from '../../lib/taskFormUtils'
import { parseDepartmentBoardKey } from '../../lib/taskDepartments'
import TaskDepartmentFields from './TaskDepartmentFields'

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
]

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export default function TaskFormModal({
  isOpen,
  editingTask = null,
  defaultDepartment = 'service',
  customDepartments = [],
  customDepartmentIcons = {},
  employees = [],
  onClose,
  onSubmit,
  isSaving = false,
  errorMessage = '',
}) {
  const buildInitialForm = () => {
    if (editingTask) return buildTaskForm(editingTask, 'service')

    const parsed = parseDepartmentBoardKey(defaultDepartment)
    if (parsed.department === 'custom') {
      return {
        ...buildTaskForm(null, 'service'),
        department: 'custom',
        departmentCustom: parsed.departmentCustom,
      }
    }

    return buildTaskForm(null, defaultDepartment)
  }

  const [form, setForm] = useState(buildInitialForm)

  useEffect(() => {
    if (!isOpen) return
    setForm(buildInitialForm())
  }, [isOpen, editingTask, defaultDepartment])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onSubmit?.({
      ...form,
      assignedEmployeeId: form.assignedEmployeeId || null,
      dueTime: form.dueTime?.trim() || null,
    })
  }


  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Task</p>
            <h3 id="task-form-title">{editingTask ? 'Edit task' : 'New task'}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close task form">
            ✕
          </button>
        </div>

        {errorMessage ? <div className="staff-status-banner">{errorMessage}</div> : null}

        <form className="employee-form task-form" onSubmit={handleSubmit}>
          <div className="form-grid task-form-grid">
            <label className="form-field task-form-field-full">
              <span>Task title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="What needs to be done?"
                required
              />
            </label>

            <TaskDepartmentFields
              department={form.department}
              departmentCustom={form.departmentCustom}
              customDepartments={customDepartments}
              customDepartmentIcons={customDepartmentIcons}
              onChange={({ department, departmentCustom }) => setForm((current) => ({
                ...current,
                department,
                departmentCustom,
              }))}
            />

            <label className="form-field">
              <span>Owner</span>
              <select
                value={form.assignedEmployeeId}
                onChange={(event) => setForm((current) => ({ ...current, assignedEmployeeId: event.target.value }))}
              >
                <option value="">Unassigned</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={String(employee.id)}>
                    {employee.full_name || employee.name || `Employee ${employee.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Priority</span>
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Due date</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                required
              />
            </label>

            <label className="form-field">
              <span>Due time (optional)</span>
              <input
                type="time"
                value={form.dueTime}
                onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))}
              />
            </label>

            <label className="form-field">
              <span>Recurrence</span>
              <select
                value={form.recurrence}
                onChange={(event) => setForm((current) => ({ ...current, recurrence: event.target.value }))}
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="form-field task-form-field-full">
              <span>Notes</span>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional context for the team"
              />
            </label>
          </div>

          <p className="task-form-recurrence-note">
            Repeat schedule will be used for automatic tasks.
          </p>

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
