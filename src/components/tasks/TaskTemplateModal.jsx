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

function createChecklistDraftItem(title = '') {
  return {
    clientKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
  }
}

function buildChecklistDraftItems(items = []) {
  return (items ?? []).map((item) => ({
    clientKey: item.id ? `existing-${item.id}` : createChecklistDraftItem().clientKey,
    title: item.title ?? '',
  }))
}

export default function TaskTemplateModal({
  isOpen,
  editingTemplate = null,
  initialChecklistItems = [],
  onClose,
  onSubmit,
  isSaving = false,
  errorMessage = '',
}) {
  const [form, setForm] = useState(() => buildTaskTemplateForm(editingTemplate))
  const [checklistItems, setChecklistItems] = useState(() => buildChecklistDraftItems(initialChecklistItems))

  useEffect(() => {
    if (!isOpen) return
    setForm(buildTaskTemplateForm(editingTemplate))
    setChecklistItems(buildChecklistDraftItems(initialChecklistItems))
  }, [isOpen, editingTemplate, initialChecklistItems])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()

    const normalizedChecklistItems = checklistItems
      .map((item) => ({ title: `${item.title ?? ''}`.trim() }))
      .filter((item) => item.title)

    await onSubmit?.({
      ...form,
      defaultTime: form.defaultTime?.trim() || null,
      checklistItems: normalizedChecklistItems,
    })
  }

  const handleAddChecklistItem = () => {
    setChecklistItems((current) => [...current, createChecklistDraftItem()])
  }

  const handleUpdateChecklistItem = (clientKey, title) => {
    setChecklistItems((current) => current.map((item) => (
      item.clientKey === clientKey ? { ...item, title } : item
    )))
  }

  const handleDeleteChecklistItem = (clientKey) => {
    setChecklistItems((current) => current.filter((item) => item.clientKey !== clientKey))
  }

  const handleMoveChecklistItem = (clientKey, direction) => {
    setChecklistItems((current) => {
      const index = current.findIndex((item) => item.clientKey === clientKey)
      if (index < 0) return current

      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= current.length) return current

      const next = [...current]
      const [movedItem] = next.splice(index, 1)
      next.splice(targetIndex, 0, movedItem)
      return next
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
                placeholder="e.g. Bar closing"
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
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Optional context for the team"
              />
            </label>
          </div>

          <div className="task-checklist-builder task-form-field-full">
            <div className="task-checklist-builder-header">
              <span className="task-checklist-builder-label">Checklist items</span>
              <button
                type="button"
                className="ghost-btn task-checklist-add-btn"
                onClick={handleAddChecklistItem}
                disabled={isSaving}
              >
                + Add item
              </button>
            </div>

            {checklistItems.length === 0 ? (
              <p className="task-checklist-builder-empty">No checklist items yet.</p>
            ) : (
              <div className="task-checklist-builder-list">
                {checklistItems.map((item, index) => (
                  <div key={item.clientKey} className="task-checklist-builder-row">
                    <input
                      type="text"
                      className="task-checklist-builder-input"
                      value={item.title}
                      onChange={(event) => handleUpdateChecklistItem(item.clientKey, event.target.value)}
                      placeholder={`Checklist item ${index + 1}`}
                      aria-label={`Checklist item ${index + 1}`}
                    />
                    <div className="task-checklist-builder-actions">
                      <button
                        type="button"
                        className="ghost-btn task-checklist-move-btn"
                        onClick={() => handleMoveChecklistItem(item.clientKey, 'up')}
                        disabled={isSaving || index === 0}
                        aria-label="Move item up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ghost-btn task-checklist-move-btn"
                        onClick={() => handleMoveChecklistItem(item.clientKey, 'down')}
                        disabled={isSaving || index === checklistItems.length - 1}
                        aria-label="Move item down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="ghost-btn task-checklist-delete-btn"
                        onClick={() => handleDeleteChecklistItem(item.clientKey)}
                        disabled={isSaving}
                        aria-label="Delete checklist item"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
