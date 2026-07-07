import { useState } from 'react'

export function OperationsTaskCompleteModal({
  task,
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [completionNote, setCompletionNote] = useState('')

  if (!task) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      await onSubmit({ completionNote: completionNote.trim() })
      onClose()
    } catch {
      // Parent shows notice
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop operations-form-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet operations-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-complete-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Complete task</p>
            <h3 id="operations-complete-title">{task.title}</h3>
          </div>
          <button type="button" className="icon-btn operations-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="employee-form operations-form" onSubmit={handleSubmit}>
          <label className="form-field full-width">
            <span>Completion note</span>
            <textarea
              rows={4}
              value={completionNote}
              onChange={(event) => setCompletionNote(event.target.value)}
              placeholder="Optional note about what was done"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="ghost-btn operations-form-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn operations-form-action" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Mark complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
