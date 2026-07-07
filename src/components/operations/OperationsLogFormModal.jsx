import { useState } from 'react'
import {
  getOperationsLogTypeLabel,
  validateOperationsLogForm,
} from '../../lib/operationsUtils'

const LOG_TYPE_OPTIONS = [
  { id: 'note', label: 'Note' },
  { id: 'incident', label: 'Issue' },
  { id: 'handover', label: 'Handover' },
]

const EMPTY_FORM = {
  type: 'note',
  message: '',
}

function buildMessageFromLog(log) {
  if (!log) return ''
  const title = `${log.title ?? ''}`.trim()
  const message = `${log.message ?? ''}`.trim()
  if (message && message !== title) return message
  return title || message
}

function buildTitleFromMessage(message) {
  const trimmed = `${message ?? ''}`.trim()
  if (!trimmed) return ''
  const firstLine = trimmed.split('\n')[0]?.trim() ?? ''
  return (firstLine || trimmed).slice(0, 120)
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
      ? { type: log.type, message: buildMessageFromLog(log) }
      : EMPTY_FORM
  ))
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const message = form.message.trim()
    const title = buildTitleFromMessage(message)
    const validationError = validateOperationsLogForm({ ...form, title, message })
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setError('')
      await onSubmit({
        type: form.type,
        title,
        message,
      })
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save note right now.')
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
            <p className="eyebrow">Shift Notes</p>
            <h3 id="operations-log-form-title">{log ? 'Edit note' : 'Add note'}</h3>
          </div>
          <button type="button" className="icon-btn operations-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="employee-form operations-form" onSubmit={handleSubmit}>
          <label className="form-field full-width">
            <span>What happened?</span>
            <textarea
              rows={5}
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Share an update for the next shift"
              required
              autoFocus
            />
          </label>

          <fieldset className="operations-shift-note-type-fieldset">
            <legend className="operations-shift-note-type-legend">Type</legend>
            <div className="operations-shift-note-type-options" role="group" aria-label="Note type">
              {LOG_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`operations-shift-note-type-option${form.type === option.id ? ' active' : ''}`}
                  aria-pressed={form.type === option.id}
                  onClick={() => setForm((current) => ({ ...current, type: option.id }))}
                >
                  {getOperationsLogTypeLabel(option.id)}
                </button>
              ))}
            </div>
          </fieldset>

          {error ? <div className="staff-status-banner">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="ghost-btn operations-form-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn operations-form-action" disabled={isSaving}>
              {isSaving ? 'Saving…' : log ? 'Save note' : 'Add note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
