import { useState } from 'react'
import {
  getOperationsLogTypeLabel,
  OPERATIONS_LOG_TYPES,
  validateOperationsLogForm,
} from '../../lib/operationsUtils'

const EMPTY_FORM = {
  type: 'note',
  title: '',
  message: '',
}

export function OperationsLogFormModal({
  isOpen,
  log = null,
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => (
    log
      ? { type: log.type, title: log.title ?? '', message: log.message ?? '' }
      : EMPTY_FORM
  ))
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateOperationsLogForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setError('')
      await onSubmit({
        type: form.type,
        title: form.title.trim(),
        message: form.message.trim(),
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save log entry right now.')
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop operations-form-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet operations-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-log-form-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Manager logbook</p>
            <h3 id="operations-log-form-title">{log ? 'Edit entry' : 'Add log entry'}</h3>
          </div>
          <button type="button" className="icon-btn operations-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="employee-form operations-form" onSubmit={handleSubmit}>
          <label className="form-field full-width">
            <span>Type</span>
            <select
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
            >
              {OPERATIONS_LOG_TYPES.map((type) => (
                <option key={type} value={type}>{getOperationsLogTypeLabel(type)}</option>
              ))}
            </select>
          </label>

          <label className="form-field full-width">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. Bar fridge temperature issue"
              required
              autoFocus
            />
          </label>

          <label className="form-field full-width">
            <span>Message</span>
            <textarea
              rows={5}
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Share handover details, incidents, or team notes"
              required
            />
          </label>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn operations-form-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn operations-form-action" disabled={isSaving}>
              {isSaving ? 'Saving…' : log ? 'Save entry' : 'Add entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
