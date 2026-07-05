import { useEffect, useState } from 'react'
import { buildTaskTemplateForm } from '../../lib/taskFormUtils'
import { TASK_DEPARTMENTS } from '../../lib/taskDepartments'

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
]

const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export default function TaskTemplateModal({
  isOpen,
  editingTemplate = null,
  onClose,
  onSubmit,
  isSaving = false,
  errorMessage = '',
}) {
  const [form, setForm] = useState(() => buildTaskTemplateForm(editingTemplate))

  useEffect(() => {
    if (!isOpen) return
    setForm(buildTaskTemplateForm(editingTemplate))
  }, [isOpen, editingTemplate])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onSubmit?.({
      ...form,
      defaultTime: form.defaultTime?.trim() || null,
    })
  }

  const showCustomDepartment = form.department === 'custom'

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-template-form-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Template</p>
            <h3 id="task-template-form-title">
              {editingTemplate ? 'Edit template' : 'New template'}
            </h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close template form">
            ✕
          </button>
        </div>

        {errorMessage ? <div className="staff-status-banner">{errorMessage}</div> : null}

        <form className="employee-form task-form" onSubmit={handleSubmit}>
          <div className="form-grid task-form-grid">
            <label className="form-field task-form-field-full">
              <span>Template title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="e.g. Service opening"
                required
              />
            </label>

            <label className="form-field">
              <span>Department</span>
              <select
                value={form.department}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  department: event.target.value,
                  departmentCustom: event.target.value === 'custom' ? current.departmentCustom : '',
                }))}
              >
                {TASK_DEPARTMENTS.map((department) => (
                  <option key={department.key} value={department.key}>
                    {department.label}
                  </option>
                ))}
              </select>
            </label>

            {showCustomDepartment ? (
              <label className="form-field">
                <span>Custom department name</span>
                <input
                  type="text"
                  value={form.departmentCustom}
                  onChange={(event) => setForm((current) => ({ ...current, departmentCustom: event.target.value }))}
                  placeholder="Department name"
                  required
                />
              </label>
            ) : null}

            <label className="form-field">
              <span>Default time (optional)</span>
              <input
                type="time"
                value={form.defaultTime}
                onChange={(event) => setForm((current) => ({ ...current, defaultTime: event.target.value }))}
              />
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
                placeholder="Optional checklist or context"
              />
            </label>
          </div>

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
