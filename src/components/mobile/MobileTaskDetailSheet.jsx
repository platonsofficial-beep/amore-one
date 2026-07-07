import { useEffect, useState } from 'react'
import {
  formatOperationsDueTime,
  getOperationsCategoryLabel,
  getOperationsPriorityLabel,
  normalizeOperationsStatus,
} from '../../lib/operationsUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { parseLocalDate } from '../../lib/weekUtils'

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function formatTaskDueLabel(task, todayKey = '') {
  const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
  const dueTime = formatTime24(task?.dueTime ?? task?.due_time, '')

  let dateLabel = 'No due date'
  if (dueDate) {
    if (dueDate === todayKey) {
      dateLabel = 'Today'
    } else {
      const parsed = parseLocalDate(dueDate)
      dateLabel = Number.isNaN(parsed.getTime())
        ? dueDate
        : new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }).format(parsed)
    }
  }

  if (dueTime) return `${dateLabel} · ${dueTime}`
  if (dueDate && !dueTime) return dateLabel
  return formatOperationsDueTime(task?.dueTime) || dateLabel
}

function formatCompletedTimestamp(value) {
  if (!value) return '—'

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed)
  }

  return normalizeTaskDateKey(value) || '—'
}

function getStatusLabel(status) {
  const normalized = normalizeOperationsStatus(status)
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'skipped') return 'Skipped'
  return 'Pending'
}

export function MobileTaskDetailSheet({
  task = null,
  assigneeName = 'Unassigned',
  todayKey = '',
  canComplete = false,
  isSaving = false,
  onClose,
  onComplete,
}) {
  const [step, setStep] = useState('detail')
  const [completionNote, setCompletionNote] = useState('')

  useEffect(() => {
    setStep('detail')
    setCompletionNote('')
  }, [task?.id])

  if (!task) return null

  const isDone = normalizeOperationsStatus(task.status) !== 'pending'
  const priority = `${task.priority ?? 'normal'}`.trim().toLowerCase()

  const handleClose = () => {
    setStep('detail')
    setCompletionNote('')
    onClose?.()
  }

  const handleCompleteSubmit = async (event) => {
    event.preventDefault()
    try {
      await onComplete?.({ completionNote: completionNote.trim() })
      setStep('detail')
      setCompletionNote('')
    } catch {
      // Parent handles errors
    }
  }

  return (
    <div className="mobile-sheet-backdrop" onClick={handleClose}>
      <div
        className="mobile-sheet mobile-task-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-task-sheet-title"
      >
        <div className="mobile-sheet-handle" aria-hidden="true" />

        <header className="mobile-sheet-header">
          <div className="mobile-sheet-header-copy">
            <p className="mobile-screen-eyebrow">{getOperationsCategoryLabel(task.category)}</p>
            <h2 id="mobile-task-sheet-title" className="mobile-sheet-title">{task.title}</h2>
          </div>
          <button
            type="button"
            className="mobile-sheet-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {step === 'complete' ? (
          <form className="mobile-sheet-body" onSubmit={handleCompleteSubmit}>
            <p className="mobile-sheet-lead">Add an optional note about what was done.</p>
            <label className="mobile-sheet-field">
              <span>Completion note</span>
              <textarea
                rows={4}
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                placeholder="Optional note"
              />
            </label>
            <div className="mobile-sheet-actions">
              <button
                type="button"
                className="mobile-secondary-btn"
                onClick={() => setStep('detail')}
                disabled={isSaving}
              >
                Back
              </button>
              <button type="submit" className="mobile-primary-btn" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Mark complete'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mobile-sheet-body">
            {task.description ? (
              <p className="mobile-sheet-description">{task.description}</p>
            ) : null}

            <dl className="mobile-task-detail-grid">
              <div>
                <dt>Due</dt>
                <dd>{formatTaskDueLabel(task, todayKey)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <span className={`mobile-task-priority-badge priority-${priority}`}>
                    {getOperationsPriorityLabel(task.priority)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Assigned</dt>
                <dd>{assigneeName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{getStatusLabel(task.status)}</dd>
              </div>
              {isDone ? (
                <>
                  <div>
                    <dt>Completed by</dt>
                    <dd>{task.completedByName || 'Team member'}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{formatCompletedTimestamp(task.completedAt ?? task.completed_at)}</dd>
                  </div>
                </>
              ) : null}
            </dl>

            {task.completionNote ? (
              <div className="mobile-task-completion-note">
                <p className="mobile-sheet-field-label">Completion note</p>
                <p>{task.completionNote}</p>
              </div>
            ) : null}

            <div className="mobile-sheet-actions">
              {canComplete && !isDone ? (
                <button
                  type="button"
                  className="mobile-primary-btn"
                  onClick={() => setStep('complete')}
                  disabled={isSaving}
                >
                  Complete task
                </button>
              ) : null}
              <button
                type="button"
                className="mobile-secondary-btn"
                onClick={handleClose}
                disabled={isSaving}
              >
                {canComplete && !isDone ? 'Cancel' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
